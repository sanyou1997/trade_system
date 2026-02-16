import json
import logging
from datetime import datetime, timezone

import openpyxl
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.phone import Phone
from app.models.phone_inventory import PhoneInventoryPeriod
from app.models.stock_import_log import ImportStatus, StockImportLog
from app.schemas.stock_import import (
    ImportConfirmItem,
    ImportPreviewItem,
    ImportPreviewResult,
)

logger = logging.getLogger(__name__)


def _normalize(value: str | None) -> str:
    if not value:
        return ""
    return value.strip().lower()


def parse_stock_excel(file_path: str) -> list[dict]:
    """Parse a phone stock Excel file.

    Expected layout:
      A=Package, B=Brand, C=Model, D=Config, E=Quantity
      Row 1 = headers, Row 2+ = data.
      Rows with empty Brand AND Model are skipped (package group headers).
    """
    wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
    ws = wb.active
    if ws is None:
        wb.close()
        raise ValueError("Excel file has no active sheet")

    rows: list[dict] = []
    for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=False), start=2):
        if len(row) < 5:
            continue

        brand = str(row[1].value or "").strip()
        model_name = str(row[2].value or "").strip()
        config = str(row[3].value or "").strip()
        qty_raw = row[4].value

        # Skip package group header rows (no brand/model)
        if not brand and not model_name:
            continue

        quantity = 0
        if qty_raw is not None:
            try:
                quantity = int(float(qty_raw))
            except (ValueError, TypeError):
                pass

        if quantity <= 0:
            continue

        rows.append({
            "row": row_idx,
            "brand": brand,
            "model": model_name,
            "config": config,
            "quantity": quantity,
        })

    wb.close()
    return rows


def _match_phone(phones: list[Phone], brand: str, model_name: str, config: str) -> int | None:
    """Match a phone by brand + model + config (case-insensitive, trimmed)."""
    nb = _normalize(brand)
    nm = _normalize(model_name)
    nc = _normalize(config)

    for p in phones:
        if (
            _normalize(p.brand) == nb
            and _normalize(p.model) == nm
            and _normalize(p.config) == nc
        ):
            return p.id

    # Fallback: brand + model only when config is empty in Excel
    if not nc:
        for p in phones:
            if _normalize(p.brand) == nb and _normalize(p.model) == nm:
                return p.id

    return None


async def preview_import(
    db: AsyncSession,
    file_path: str,
    file_name: str,
    year: int,
    month: int,
) -> ImportPreviewResult:
    """Parse Excel and match against existing phones. Returns preview."""
    parsed_rows = parse_stock_excel(file_path)

    result = await db.execute(select(Phone).order_by(Phone.id))
    all_phones = list(result.scalars().all())

    inv_result = await db.execute(
        select(PhoneInventoryPeriod).where(
            PhoneInventoryPeriod.year == year,
            PhoneInventoryPeriod.month == month,
        )
    )
    inv_by_phone = {inv.phone_id: inv for inv in inv_result.scalars().all()}

    items: list[ImportPreviewItem] = []
    matched_count = 0
    total_qty = 0

    for row_data in parsed_rows:
        phone_id = _match_phone(
            all_phones, row_data["brand"], row_data["model"], row_data["config"]
        )
        matched = phone_id is not None
        current_added = None
        if matched and phone_id in inv_by_phone:
            current_added = inv_by_phone[phone_id].added_stock

        items.append(ImportPreviewItem(
            row_number=row_data["row"],
            brand=row_data["brand"],
            model=row_data["model"],
            config=row_data["config"],
            quantity=row_data["quantity"],
            matched=matched,
            phone_id=phone_id,
            current_added_stock=current_added,
        ))

        if matched:
            matched_count += 1
        total_qty += row_data["quantity"]

    return ImportPreviewResult(
        file_name=file_name,
        total_rows=len(items),
        matched_rows=matched_count,
        unmatched_rows=len(items) - matched_count,
        total_quantity=total_qty,
        items=items,
        all_matched=matched_count == len(items) and len(items) > 0,
    )


async def confirm_import(
    db: AsyncSession,
    year: int,
    month: int,
    file_name: str,
    items: list[ImportConfirmItem],
) -> StockImportLog:
    """Execute the import: add quantities to added_stock and create a log."""
    total_qty = 0
    items_for_log: list[dict] = []

    for item in items:
        result = await db.execute(
            select(PhoneInventoryPeriod).where(
                PhoneInventoryPeriod.phone_id == item.phone_id,
                PhoneInventoryPeriod.year == year,
                PhoneInventoryPeriod.month == month,
            )
        )
        inv = result.scalar_one_or_none()

        if inv is None:
            inv = PhoneInventoryPeriod(
                phone_id=item.phone_id,
                year=year,
                month=month,
                initial_stock=0,
                added_stock=item.quantity,
            )
            db.add(inv)
        else:
            inv.added_stock = inv.added_stock + item.quantity

        total_qty += item.quantity
        items_for_log.append({
            "phone_id": item.phone_id,
            "brand": item.brand,
            "model": item.model,
            "config": item.config,
            "quantity": item.quantity,
        })

    log = StockImportLog(
        product_type="phone",
        year=year,
        month=month,
        file_name=file_name,
        items_json=json.dumps(items_for_log),
        total_quantity=total_qty,
        total_products=len(items),
        status=ImportStatus.ACTIVE,
    )
    db.add(log)
    await db.flush()

    logger.info(
        "Stock import confirmed: %s, %d products, %d total qty for %d/%d",
        file_name, len(items), total_qty, year, month,
    )
    return log


async def revert_import(
    db: AsyncSession,
    log_id: int,
) -> StockImportLog:
    """Undo an import by subtracting quantities from added_stock."""
    result = await db.execute(
        select(StockImportLog).where(StockImportLog.id == log_id)
    )
    log = result.scalar_one_or_none()

    if log is None:
        raise ValueError(f"Import log {log_id} not found")
    if log.status == ImportStatus.REVERTED:
        raise ValueError(f"Import log {log_id} has already been reverted")

    items = json.loads(log.items_json)

    for item in items:
        inv_result = await db.execute(
            select(PhoneInventoryPeriod).where(
                PhoneInventoryPeriod.phone_id == item["phone_id"],
                PhoneInventoryPeriod.year == log.year,
                PhoneInventoryPeriod.month == log.month,
            )
        )
        inv = inv_result.scalar_one_or_none()
        if inv is not None:
            inv.added_stock = max(0, inv.added_stock - item["quantity"])

    log.status = ImportStatus.REVERTED
    log.reverted_at = datetime.now(timezone.utc)
    await db.flush()

    logger.info("Stock import %d reverted", log_id)
    return log


async def get_import_history(
    db: AsyncSession,
    product_type: str = "phone",
    limit: int = 50,
) -> list[StockImportLog]:
    """Get recent import logs."""
    result = await db.execute(
        select(StockImportLog)
        .where(StockImportLog.product_type == product_type)
        .order_by(StockImportLog.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())
