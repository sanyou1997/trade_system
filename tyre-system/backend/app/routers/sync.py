"""Sync router - import/export between database and Excel files."""

from __future__ import annotations

import datetime
from pathlib import Path

import shutil
import tempfile

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.excel.sync import SyncManager
from app.excel.writer import ExcelWriter
from app.models.exchange_rate import ExchangeRate, RateType
from app.models.inventory import InventoryPeriod
from app.models.loss import Loss, LossType
from app.models.payment import Payment
from app.models.sale import PaymentMethod, Sale
from app.models.sync_log import SyncDirection, SyncLog, SyncStatus
from app.models.tyre import Tyre, TyreCategory
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/sync", tags=["sync"])

# --- Helpers ---

INVENTORY_FILE = "Tyre_List_Internal_Available.xlsx"
INVOICE_PATTERN = "Invoice_Tyres_{year}.{month}.xlsx"
DAILY_PATTERN = "Tyre Sales *.xlsx"


def _save_upload(upload: UploadFile) -> Path:
    """Save an uploaded file to a temp file and return the path.

    The caller is responsible for cleaning up via os.unlink().
    """
    suffix = Path(upload.filename or "upload.xlsx").suffix or ".xlsx"
    fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    try:
        with open(fd, "wb") as f:
            shutil.copyfileobj(upload.file, f)
    except Exception:
        Path(tmp_path).unlink(missing_ok=True)
        raise
    return Path(tmp_path)


def _get_inventory_path() -> Path:
    return Path(settings.EXCEL_DIR) / INVENTORY_FILE


def _get_invoice_path(year: int, month: int) -> Path:
    return Path(settings.EXCEL_DIR) / f"Invoice_Tyres_{year}.{month}.xlsx"


import re


def _parse_tyre_size(raw: str) -> dict | None:
    """Parse a tyre size string into structured components.

    Handles human input variations like:
    - '175/70/R13', '17570R13', '175/70R13', '175 70 R13'
    - '155/R12C', '155R12C', '155/12C', '15512C'
    - '235/45Z/R18', '23545ZR18'
    - '265/65/R17LT', '26565R17LT', '265/65R17'

    Returns dict: {width, aspect, speed, rim, suffix} or None.
    """
    s = raw.strip().upper()
    if not s:
        return None

    # Extract suffix (LT or C at end after digits)
    suffix = ""
    if s.endswith("LT"):
        suffix = "LT"
        s = s[:-2]
    elif re.search(r"\dC$", s):
        suffix = "C"
        s = s[:-1]

    # Extract speed rating letter (Z, W, Y, V, H between digits)
    speed = ""
    m = re.search(r"(\d)([ZWYVH])(?=[\d/R])", s)
    if m:
        speed = m.group(2)
        s = s[: m.start(2)] + s[m.end(2) :]

    # Remove all non-digit characters
    digits = re.sub(r"[^0-9]", "", s)

    if len(digits) == 7:
        # WIDTH(3) + ASPECT(2) + RIM(2): e.g. 1757013
        return {
            "width": digits[:3],
            "aspect": digits[3:5],
            "speed": speed,
            "rim": digits[5:7],
            "suffix": suffix,
        }
    elif len(digits) == 5:
        # WIDTH(3) + RIM(2), no aspect: e.g. 15512
        return {
            "width": digits[:3],
            "aspect": "",
            "speed": speed,
            "rim": digits[3:5],
            "suffix": suffix,
        }
    return None


def _size_match_key(parsed: dict) -> tuple:
    """Return a matching key (width, aspect, rim) ignoring speed/suffix."""
    return (parsed["width"], parsed["aspect"], parsed["rim"])


def _build_size_map(tyres: list) -> dict[tuple, list]:
    """Build (width, aspect, rim) -> [list of tyres] mapping.

    Keeps all tyres per size key so we can disambiguate by type/brand.
    """
    size_map: dict[tuple, list] = {}
    for t in tyres:
        parsed = _parse_tyre_size(t.size)
        if parsed is None:
            continue
        key = _size_match_key(parsed)
        if key not in size_map:
            size_map[key] = []
        size_map[key].append(t)
    return size_map


def _match_tyre_id(
    size_map: dict[tuple, list],
    size: str,
    type_str: str | None = None,
    brand: str | None = None,
) -> int | None:
    """Match a tyre ID using size, optionally using type/brand to disambiguate.

    When multiple tyres share the same size (e.g., branded new vs second hand),
    uses the type and brand from the sale to pick the correct one.
    """
    parsed = _parse_tyre_size(size)
    if parsed is None:
        return None
    key = _size_match_key(parsed)
    candidates = size_map.get(key)
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0].id

    # Multiple candidates with same size — disambiguate by category
    if type_str is not None or brand is not None:
        target_category = _classify_tyre(type_str, brand)
        for t in candidates:
            if t.category == target_category:
                return t.id

    # Fall back to first candidate
    return candidates[0].id


def _classify_tyre(type_str: str | None, brand: str | None) -> TyreCategory:
    t = (type_str or "").strip().lower()
    if "second" in t:
        return TyreCategory.SECOND_HAND
    if "brandless" in t or "new but brandless" in t:
        return TyreCategory.BRANDLESS_NEW
    if brand and brand.strip():
        return TyreCategory.BRANDED_NEW
    return TyreCategory.BRANDLESS_NEW


def _map_payment_method(method: str | None) -> PaymentMethod:
    if not method:
        return PaymentMethod.CASH
    m = method.strip().lower()
    if "mukuru" in m:
        return PaymentMethod.MUKURU
    if "card" in m:
        return PaymentMethod.CARD
    return PaymentMethod.CASH


async def _log_sync(
    db: AsyncSession,
    file_path: str,
    direction: SyncDirection,
    status: SyncStatus,
    records: int = 0,
    error: str | None = None,
    file_hash: str | None = None,
) -> SyncLog:
    log = SyncLog(
        file_path=file_path,
        direction=direction,
        status=status,
        records_processed=records,
        error_message=error,
        file_hash=file_hash,
    )
    db.add(log)
    await db.commit()
    return log


# --- Import: Inventory ---

@router.post("/import/inventory")
async def import_inventory(
    file: UploadFile = File(..., description="Inventory Excel file (.xlsx)"),
    month: int = Query(default=None, ge=1, le=12),
    year: int = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Import tyres + stock + exchange rate from an uploaded inventory Excel file.

    Creates tyre records if they don't exist (matched by size + type + brand).
    Updates inventory_periods for the given month.
    """
    now = datetime.date.today()
    year = year or now.year
    month = month or now.month

    inv_path = _save_upload(file)
    original_name = file.filename or "inventory.xlsx"

    try:
        data = SyncManager.import_from_inventory(str(inv_path), month)
        tyres_data = data["tyres"]
        exchange_rate = data["exchange_rate"]

        imported = 0
        for td in tyres_data:
            # Find existing tyre by excel_row or size+type+brand
            result = await db.execute(
                select(Tyre).where(Tyre.excel_row == td["row"])
            )
            tyre = result.scalar_one_or_none()

            if tyre is None:
                # Try matching by size + type
                result = await db.execute(
                    select(Tyre).where(
                        Tyre.size == td["size"],
                        Tyre.type_ == (td["type"] or "Unknown"),
                    )
                )
                tyre = result.scalar_one_or_none()

            if tyre is None:
                tyre = Tyre(
                    size=td["size"],
                    type_=td["type"] or "Unknown",
                    brand=td["brand"],
                    pattern=td["pattern"],
                    li_sr=td["li_sr"],
                    tyre_cost=td["tyre_cost"],
                    suggested_price=td.get("original_price", 0.0),
                    category=_classify_tyre(td["type"], td["brand"]),
                    excel_row=td["row"],
                )
                db.add(tyre)
                await db.commit()
            else:
                # Update fields
                tyre.tyre_cost = td["tyre_cost"]
                tyre.suggested_price = td.get("original_price", 0.0)
                tyre.excel_row = td["row"]

            # Upsert inventory period
            inv_result = await db.execute(
                select(InventoryPeriod).where(
                    InventoryPeriod.tyre_id == tyre.id,
                    InventoryPeriod.year == year,
                    InventoryPeriod.month == month,
                )
            )
            inv = inv_result.scalar_one_or_none()
            if inv is None:
                inv = InventoryPeriod(
                    tyre_id=tyre.id,
                    year=year,
                    month=month,
                    initial_stock=td["initial_stock"],
                    added_stock=td["added_stock"],
                )
                db.add(inv)
            else:
                inv.initial_stock = td["initial_stock"]
                inv.added_stock = td["added_stock"]

            imported += 1

        # Save exchange rate
        for rt in [RateType.CASH, RateType.MUKURU]:
            rate_result = await db.execute(
                select(ExchangeRate).where(
                    ExchangeRate.year == year,
                    ExchangeRate.month == month,
                    ExchangeRate.rate_type == rt,
                )
            )
            rate = rate_result.scalar_one_or_none()
            if rate is None:
                db.add(ExchangeRate(
                    year=year, month=month,
                    rate_type=rt, rate=exchange_rate,
                ))
            else:
                rate.rate = exchange_rate

        file_hash = SyncManager.compute_file_hash(str(inv_path))
        await _log_sync(
            db, original_name, SyncDirection.IMPORT,
            SyncStatus.SUCCESS, imported, file_hash=file_hash,
        )

        return ApiResponse.ok({
            "tyres_imported": imported,
            "exchange_rate": exchange_rate,
            "year": year,
            "month": month,
        })

    except Exception as e:
        await _log_sync(
            db, original_name, SyncDirection.IMPORT,
            SyncStatus.FAILED, error=str(e),
        )
        return ApiResponse.fail(f"Import failed: {e}")

    finally:
        inv_path.unlink(missing_ok=True)


# --- Import: Monthly Invoice ---

@router.post("/import/invoice")
async def import_invoice(
    file: UploadFile = File(..., description="Invoice Excel file (.xlsx)"),
    month: int = Query(default=None, ge=1, le=12),
    year: int = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Import sales, payments, losses, and exchange rates from an uploaded invoice file."""
    now = datetime.date.today()
    year = year or now.year
    month = month or now.month

    inv_path = _save_upload(file)
    original_name = file.filename or "invoice.xlsx"

    try:
        data = SyncManager.import_from_invoice(str(inv_path))
        sales_data = data["sales"]
        payments_data = data["payments"]
        losses_data = data["losses"]
        stats = data["statistics"]

        # Build size -> tyre_id mapping with normalization
        tyre_result = await db.execute(select(Tyre))
        all_tyres = tyre_result.scalars().all()
        size_to_id = _build_size_map(all_tyres)

        # Import sales (with duplicate detection)
        sales_count = 0
        skipped_sizes: list[str] = []
        duplicates_skipped = 0
        for sd in sales_data:
            raw_size = (sd.get("size") or "").strip()
            if not raw_size:
                continue
            tyre_id = _match_tyre_id(
                size_to_id, raw_size, sd.get("type"), sd.get("brand"),
            )
            if tyre_id is None:
                skipped_sizes.append(raw_size)
                continue

            sale_date = sd.get("date") or datetime.date(year, month, 1)
            qty = sd.get("qty", 0)
            unit_price = sd.get("unit_price", 0)
            raw_discount = sd.get("discount", 0)
            # Excel stores discount as decimal (0.05 = 5%); normalize to percentage
            discount_pct = raw_discount * 100 if 0 < raw_discount < 1 else raw_discount
            total = sd.get("total", 0)
            if not total and qty and unit_price:
                total = qty * unit_price * (1 - discount_pct / 100)

            # Check for duplicate sale
            dup_result = await db.execute(
                select(Sale).where(and_(
                    Sale.sale_date == sale_date,
                    Sale.tyre_id == tyre_id,
                    Sale.quantity == qty,
                    Sale.unit_price == unit_price,
                ))
            )
            if dup_result.scalar_one_or_none() is not None:
                duplicates_skipped += 1
                continue

            sale = Sale(
                sale_date=sale_date,
                tyre_id=tyre_id,
                quantity=qty,
                unit_price=unit_price,
                discount=discount_pct,
                total=total,
                payment_method=_map_payment_method(sd.get("payment_method")),
                customer_name=sd.get("customer_name"),
                synced=True,
            )
            db.add(sale)
            sales_count += 1

        # Import payments (with duplicate detection)
        pay_count = 0
        pay_duplicates_skipped = 0
        for pd_item in payments_data:
            pay_date = pd_item.get("date") or datetime.date(year, month, 1)
            amount = pd_item.get("amount_mwk", 0)
            customer = pd_item.get("customer") or "Unknown"

            # Check for duplicate payment
            dup_result = await db.execute(
                select(Payment).where(and_(
                    Payment.payment_date == pay_date,
                    Payment.customer == customer,
                    Payment.amount_mwk == amount,
                ))
            )
            if dup_result.scalar_one_or_none() is not None:
                pay_duplicates_skipped += 1
                continue

            payment = Payment(
                payment_date=pay_date,
                customer=customer,
                payment_method=pd_item.get("payment_method") or "Cash",
                amount_mwk=amount,
            )
            db.add(payment)
            pay_count += 1

        # Import losses
        loss_count = 0
        for ld in losses_data:
            raw_config = (ld.get("config") or "").strip()
            if not raw_config:
                continue
            tyre_id = _match_tyre_id(
                size_to_id, raw_config, ld.get("model"), ld.get("brand"),
            )
            if tyre_id is None:
                continue

            loss_date = ld.get("date") or datetime.date(year, month, 1)
            exchanged = (ld.get("exchanged") or "").strip().lower()
            if "exchange" in exchanged or exchanged == "yes":
                loss_type = LossType.EXCHANGE
            elif ld.get("refund", 0) > 0 or ld.get("total_refund", 0) > 0:
                loss_type = LossType.REFUND
            else:
                loss_type = LossType.BROKEN

            loss = Loss(
                loss_date=loss_date,
                tyre_id=tyre_id,
                quantity=ld.get("qty", 0),
                loss_type=loss_type,
                refund_amount=ld.get("total_refund", 0),
                notes=ld.get("note"),
            )
            db.add(loss)
            loss_count += 1

        # Import exchange rates from stats
        mukuru_rate = stats.get("mukuru_rate", 0)
        cash_rate = stats.get("cash_rate", 0)
        for rt, rv in [(RateType.MUKURU, mukuru_rate), (RateType.CASH, cash_rate)]:
            if rv > 0:
                rate_result = await db.execute(
                    select(ExchangeRate).where(
                        ExchangeRate.year == year,
                        ExchangeRate.month == month,
                        ExchangeRate.rate_type == rt,
                    )
                )
                rate = rate_result.scalar_one_or_none()
                if rate is None:
                    db.add(ExchangeRate(
                        year=year, month=month, rate_type=rt, rate=rv,
                    ))
                else:
                    rate.rate = rv

        total_records = sales_count + pay_count + loss_count
        file_hash = SyncManager.compute_file_hash(str(inv_path))
        await _log_sync(
            db, original_name, SyncDirection.IMPORT,
            SyncStatus.SUCCESS, total_records, file_hash=file_hash,
        )

        result_data: dict = {
            "sales_imported": sales_count,
            "payments_imported": pay_count,
            "losses_imported": loss_count,
            "mukuru_rate": mukuru_rate,
            "cash_rate": cash_rate,
        }
        if duplicates_skipped:
            result_data["sales_duplicates_skipped"] = duplicates_skipped
        if pay_duplicates_skipped:
            result_data["payments_duplicates_skipped"] = pay_duplicates_skipped
        if skipped_sizes:
            result_data["skipped_sizes"] = skipped_sizes

        return ApiResponse.ok(result_data)

    except Exception as e:
        await _log_sync(
            db, original_name, SyncDirection.IMPORT,
            SyncStatus.FAILED, error=str(e),
        )
        return ApiResponse.fail(f"Import failed: {e}")

    finally:
        inv_path.unlink(missing_ok=True)


# --- Import: Daily Sales ---

@router.post("/import/daily-sales")
async def import_daily_sales(
    file: UploadFile = File(..., description="Daily sales Excel file (.xlsx)"),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Import sales and payments from an uploaded daily sales file."""
    file_path = _save_upload(file)
    original_name = file.filename or "daily_sales.xlsx"

    try:
        data = SyncManager.import_from_daily_sales(str(file_path))
        sales_data = data["sales"]
        payments_data = data["payments"]

        # Build size -> tyre_id mapping with normalization
        tyre_result = await db.execute(select(Tyre))
        all_tyres = tyre_result.scalars().all()
        size_to_id = _build_size_map(all_tyres)

        # Determine fallback date: first non-null date in sales data, then payments
        fallback_date = None
        for sd in sales_data:
            if sd.get("date"):
                fallback_date = sd["date"]
                break
        if fallback_date is None:
            for pd_item in payments_data:
                if pd_item.get("date"):
                    fallback_date = pd_item["date"]
                    break
        if fallback_date is None:
            fallback_date = datetime.date.today()

        sales_count = 0
        skipped_sizes: list[str] = []
        duplicates_skipped = 0
        for sd in sales_data:
            raw_size = (sd.get("size") or "").strip()
            if not raw_size:
                continue
            tyre_id = _match_tyre_id(
                size_to_id, raw_size, sd.get("type"), sd.get("brand"),
            )
            if tyre_id is None:
                skipped_sizes.append(raw_size)
                continue

            sale_date = sd.get("date") or fallback_date
            qty = sd.get("qty", 0)
            unit_price = sd.get("unit_price", 0)
            raw_discount = sd.get("discount", 0)
            # Excel stores discount as decimal (0.05 = 5%); normalize to percentage
            discount_pct = raw_discount * 100 if 0 < raw_discount < 1 else raw_discount
            total = sd.get("total", 0)
            if not total and qty and unit_price:
                total = qty * unit_price * (1 - discount_pct / 100)

            # Check for duplicate sale
            dup_result = await db.execute(
                select(Sale).where(and_(
                    Sale.sale_date == sale_date,
                    Sale.tyre_id == tyre_id,
                    Sale.quantity == qty,
                    Sale.unit_price == unit_price,
                ))
            )
            if dup_result.scalar_one_or_none() is not None:
                duplicates_skipped += 1
                continue

            sale = Sale(
                sale_date=sale_date,
                tyre_id=tyre_id,
                quantity=qty,
                unit_price=unit_price,
                discount=discount_pct,
                total=total,
                payment_method=_map_payment_method(sd.get("payment_method")),
                customer_name=sd.get("customer_name"),
                synced=True,
            )
            db.add(sale)
            sales_count += 1

        pay_count = 0
        pay_duplicates_skipped = 0
        for pd_item in payments_data:
            pay_date = pd_item.get("date") or fallback_date
            amount = pd_item.get("amount_mwk", 0)
            customer = pd_item.get("customer") or "Unknown"

            # Check for duplicate payment
            dup_result = await db.execute(
                select(Payment).where(and_(
                    Payment.payment_date == pay_date,
                    Payment.customer == customer,
                    Payment.amount_mwk == amount,
                ))
            )
            if dup_result.scalar_one_or_none() is not None:
                pay_duplicates_skipped += 1
                continue

            payment = Payment(
                payment_date=pay_date,
                customer=customer,
                payment_method=pd_item.get("payment_method") or "Cash",
                amount_mwk=amount,
            )
            db.add(payment)
            pay_count += 1

        total_records = sales_count + pay_count
        file_hash = SyncManager.compute_file_hash(str(file_path))
        await _log_sync(
            db, original_name, SyncDirection.IMPORT,
            SyncStatus.SUCCESS, total_records, file_hash=file_hash,
        )

        result_data: dict = {
            "sales_imported": sales_count,
            "payments_imported": pay_count,
        }
        if duplicates_skipped:
            result_data["sales_duplicates_skipped"] = duplicates_skipped
        if pay_duplicates_skipped:
            result_data["payments_duplicates_skipped"] = pay_duplicates_skipped
        if skipped_sizes:
            result_data["skipped_sizes"] = skipped_sizes

        return ApiResponse.ok(result_data)

    except Exception as e:
        await _log_sync(
            db, original_name, SyncDirection.IMPORT,
            SyncStatus.FAILED, error=str(e),
        )
        return ApiResponse.fail(f"Import failed: {e}")

    finally:
        file_path.unlink(missing_ok=True)


# --- Export: Inventory ---

@router.post("/export/inventory")
async def export_inventory(
    month: int = Query(default=None, ge=1, le=12),
    year: int = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Export daily sales to the inventory Excel file.

    Auto-creates the month sheet if it doesn't exist.
    """
    now = datetime.date.today()
    year = year or now.year
    month = month or now.month

    inv_path = _get_inventory_path()
    if not inv_path.exists():
        return ApiResponse.fail(f"Inventory file not found: {inv_path.name}")

    try:
        # Auto-create month sheet if it doesn't exist
        sheet_created = ExcelWriter.ensure_month_sheet(str(inv_path), month)

        # Build tyre_id -> excel_row mapping
        tyre_result = await db.execute(select(Tyre).where(Tyre.excel_row.isnot(None)))
        tyre_map = {t.id: t.excel_row for t in tyre_result.scalars().all()}

        # Build stock data from inventory_periods
        inv_periods_result = await db.execute(
            select(InventoryPeriod).where(
                InventoryPeriod.year == year,
                InventoryPeriod.month == month,
            )
        )
        stock_data = []
        for inv in inv_periods_result.scalars().all():
            excel_row = tyre_map.get(inv.tyre_id)
            if excel_row is not None:
                stock_data.append({
                    "row": excel_row,
                    "initial_stock": inv.initial_stock or 0,
                    "added_stock": inv.added_stock or 0,
                })

        # Get all sales for the month, grouped by day and tyre
        sales_result = await db.execute(
            select(Sale).where(
                Sale.sale_date >= datetime.date(year, month, 1),
                Sale.sale_date < datetime.date(
                    year + (1 if month == 12 else 0),
                    (month % 12) + 1, 1
                ),
            )
        )
        sales_by_day: dict[int, list[dict]] = {}
        for sale in sales_result.scalars().all():
            day = sale.sale_date.day
            excel_row = tyre_map.get(sale.tyre_id)
            if excel_row is None:
                continue
            if day not in sales_by_day:
                sales_by_day[day] = []
            existing = next(
                (s for s in sales_by_day[day] if s["row"] == excel_row), None
            )
            if existing:
                existing["qty"] += sale.quantity
            else:
                sales_by_day[day].append({"row": excel_row, "qty": sale.quantity})

        # Single batch write: clears stale data, writes stock + daily sales
        records = ExcelWriter.export_inventory_batch(
            str(inv_path), month, stock_data, sales_by_day
        )

        file_hash = SyncManager.compute_file_hash(str(inv_path))
        await _log_sync(
            db, inv_path.name, SyncDirection.EXPORT,
            SyncStatus.SUCCESS, records,
            file_hash=file_hash,
        )

        return ApiResponse.ok({
            "records_written": records,
            "days_processed": len(sales_by_day),
            "stock_entries": len(stock_data),
            "sheet_created": sheet_created,
            "file_name": inv_path.name,
        })

    except Exception as e:
        await _log_sync(
            db, inv_path.name, SyncDirection.EXPORT,
            SyncStatus.FAILED, error=str(e),
        )
        return ApiResponse.fail(f"Export failed: {e}")


# --- Export: Invoice ---

@router.post("/export/invoice")
async def export_invoice(
    month: int = Query(default=None, ge=1, le=12),
    year: int = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Export sales and payments to the invoice Excel file.

    Auto-creates the invoice file if it doesn't exist.
    """
    now = datetime.date.today()
    year = year or now.year
    month = month or now.month

    inv_path = _get_invoice_path(year, month)

    # Auto-create invoice file if it doesn't exist
    file_created = False
    if not inv_path.exists():
        ExcelWriter.create_invoice_file(str(inv_path))
        file_created = True

    try:
        # Get ALL sales for the month (no synced filter — full export each time)
        month_start = datetime.date(year, month, 1)
        month_end = datetime.date(
            year + (1 if month == 12 else 0),
            (month % 12) + 1, 1,
        )
        sales_result = await db.execute(
            select(Sale).where(
                Sale.sale_date >= month_start,
                Sale.sale_date < month_end,
            ).order_by(Sale.sale_date, Sale.id)
        )
        sales = sales_result.scalars().all()

        # Get tyre info for sales
        tyre_result = await db.execute(select(Tyre))
        tyre_map = {t.id: t for t in tyre_result.scalars().all()}

        sale_dicts = []
        for sale in sales:
            tyre = tyre_map.get(sale.tyre_id)
            sale_dicts.append({
                "date": sale.sale_date,
                "brand": tyre.brand if tyre else None,
                "type": tyre.type_ if tyre else None,
                "size": tyre.size if tyre else None,
                "qty": sale.quantity,
                "unit_price": sale.unit_price,
                "discount": sale.discount / 100 if sale.discount else 0,
                "payment_method": sale.payment_method.value,
                "customer_name": sale.customer_name,
            })

        # Get ALL payments for the month
        pay_result = await db.execute(
            select(Payment).where(
                Payment.payment_date >= month_start,
                Payment.payment_date < month_end,
            ).order_by(Payment.payment_date, Payment.id)
        )
        payments = pay_result.scalars().all()
        pay_dicts = [
            {
                "date": p.payment_date,
                "customer": p.customer,
                "payment_method": p.payment_method,
                "amount_mwk": p.amount_mwk,
            }
            for p in payments
        ]

        # Batch write: clears existing data then writes all records
        sales_written, payments_written = ExcelWriter.export_invoice_batch(
            str(inv_path), sale_dicts, pay_dicts
        )

        file_hash = SyncManager.compute_file_hash(str(inv_path))
        await _log_sync(
            db, inv_path.name, SyncDirection.EXPORT,
            SyncStatus.SUCCESS, sales_written + payments_written,
            file_hash=file_hash,
        )

        return ApiResponse.ok({
            "sales_exported": sales_written,
            "payments_exported": payments_written,
            "file_created": file_created,
            "file_name": inv_path.name,
        })

    except Exception as e:
        await _log_sync(
            db, inv_path.name, SyncDirection.EXPORT,
            SyncStatus.FAILED, error=str(e),
        )
        return ApiResponse.fail(f"Export failed: {e}")


# --- Download exported files ---

@router.get("/download/inventory")
async def download_inventory() -> FileResponse:
    """Download the inventory Excel file."""
    inv_path = _get_inventory_path()
    if not inv_path.exists():
        raise HTTPException(status_code=404, detail="Inventory file not found")
    return FileResponse(
        path=str(inv_path),
        filename=inv_path.name,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.get("/download/invoice")
async def download_invoice(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
) -> FileResponse:
    """Download the invoice Excel file for a specific month."""
    inv_path = _get_invoice_path(year, month)
    if not inv_path.exists():
        raise HTTPException(status_code=404, detail=f"Invoice file not found: {inv_path.name}")
    return FileResponse(
        path=str(inv_path),
        filename=inv_path.name,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


# --- History ---

@router.get("/history")
async def get_sync_history(
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[dict]]:
    result = await db.execute(
        select(SyncLog).order_by(SyncLog.created_at.desc()).limit(50)
    )
    logs = result.scalars().all()
    return ApiResponse.ok([
        {
            "id": log.id,
            "file_path": log.file_path,
            "direction": log.direction.value,
            "status": log.status.value,
            "records_processed": log.records_processed,
            "error_message": log.error_message,
            "file_hash": log.file_hash,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ])
