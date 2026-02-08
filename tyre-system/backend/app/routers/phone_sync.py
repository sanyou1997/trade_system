"""Phone sync router - import/export between database and phone Excel files."""

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
from app.excel.phone_sync import PhoneSyncManager
from app.excel.phone_writer import PhoneExcelWriter
from app.models.exchange_rate import ExchangeRate, RateType
from app.models.phone import Phone
from app.models.phone_inventory import PhoneInventoryPeriod
from app.models.phone_loss import PhoneLoss
from app.models.phone_sale import PhoneSale
from app.models.loss import LossType
from app.models.payment import Payment
from app.models.sale import PaymentMethod
from app.models.sync_log import SyncDirection, SyncLog, SyncStatus
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/phone-sync", tags=["phone-sync"])

# --- Helpers ---

PHONE_INVENTORY_FILE = "2025\u624b\u673a_MW Quotation.xlsx"  # 2025手机_MW Quotation.xlsx
PHONE_INVOICE_PATTERN = "Invoice_Phones_{year}.{month}.xlsx"


def _save_upload(upload: UploadFile) -> Path:
    """Save an uploaded file to a temp file and return the path."""
    suffix = Path(upload.filename or "upload.xlsx").suffix or ".xlsx"
    fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    try:
        with open(fd, "wb") as f:
            shutil.copyfileobj(upload.file, f)
    except Exception:
        Path(tmp_path).unlink(missing_ok=True)
        raise
    return Path(tmp_path)


def _get_phone_inventory_path() -> Path:
    return Path(settings.PHONE_EXCEL_DIR) / PHONE_INVENTORY_FILE


def _get_phone_invoice_path(year: int, month: int) -> Path:
    return Path(settings.PHONE_INVOICE_DIR) / f"Invoice_Phones_{year}.{month}.xlsx"


def _normalize(value: str | None) -> str:
    if not value:
        return ""
    return value.strip().lower()


def _match_phone_id(
    phones: list,
    brand: str | None,
    model: str | None,
    config: str | None,
) -> int | None:
    """Match a phone ID using brand + model + config."""
    nb = _normalize(brand)
    nm = _normalize(model)
    nc = _normalize(config)

    # Exact match
    for p in phones:
        if (
            _normalize(p.brand) == nb
            and _normalize(p.model) == nm
            and _normalize(p.config) == nc
        ):
            return p.id

    # Fallback: brand + model only
    for p in phones:
        if _normalize(p.brand) == nb and _normalize(p.model) == nm:
            return p.id

    return None


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
async def import_phone_inventory(
    file: UploadFile = File(..., description="Phone inventory Excel file (.xlsx)"),
    month: int = Query(default=None, ge=1, le=12),
    year: int = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Import phones + stock + exchange rates from an uploaded phone inventory Excel file.

    Creates phone records if they don't exist (matched by brand + model + config).
    Updates phone_inventory_periods for the given month.
    """
    now = datetime.date.today()
    year = year or now.year
    month = month or now.month

    inv_path = _save_upload(file)
    original_name = file.filename or "phone_inventory.xlsx"

    try:
        data = PhoneSyncManager.import_from_inventory(str(inv_path), month)
        phones_data = data["phones"]
        cash_rate = data["cash_rate"]
        mukuru_rate = data["mukuru_rate"]

        imported = 0
        for pd in phones_data:
            # Find existing phone by excel_row or brand+model+config
            result = await db.execute(
                select(Phone).where(Phone.excel_row == pd["row"])
            )
            phone = result.scalar_one_or_none()

            if phone is None:
                result = await db.execute(
                    select(Phone).where(
                        Phone.brand == pd["brand"],
                        Phone.model == pd["model"],
                        Phone.config == pd["config"],
                    )
                )
                phone = result.scalar_one_or_none()

            if phone is None:
                phone = Phone(
                    brand=pd["brand"],
                    model=pd["model"],
                    config=pd["config"],
                    note=pd.get("note"),
                    cost=pd["cost"],
                    cash_price=pd["cash_price"],
                    mukuru_price=pd["mukuru_price"],
                    online_price=pd["online_price"],
                    status=pd.get("status"),
                    excel_row=pd["row"],
                )
                db.add(phone)
                await db.commit()
            else:
                # Update fields
                phone.cost = pd["cost"]
                phone.cash_price = pd["cash_price"]
                phone.mukuru_price = pd["mukuru_price"]
                phone.online_price = pd["online_price"]
                phone.note = pd.get("note")
                phone.status = pd.get("status")
                phone.excel_row = pd["row"]

            # Upsert inventory period
            inv_result = await db.execute(
                select(PhoneInventoryPeriod).where(
                    PhoneInventoryPeriod.phone_id == phone.id,
                    PhoneInventoryPeriod.year == year,
                    PhoneInventoryPeriod.month == month,
                )
            )
            inv = inv_result.scalar_one_or_none()
            if inv is None:
                inv = PhoneInventoryPeriod(
                    phone_id=phone.id,
                    year=year,
                    month=month,
                    initial_stock=pd["initial_stock"],
                    added_stock=pd["added_stock"],
                )
                db.add(inv)
            else:
                inv.initial_stock = pd["initial_stock"]
                inv.added_stock = pd["added_stock"]

            imported += 1

        # Save exchange rates
        for rt, rv in [(RateType.CASH, cash_rate), (RateType.MUKURU, mukuru_rate)]:
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
                        year=year, month=month,
                        rate_type=rt, rate=rv,
                    ))
                else:
                    rate.rate = rv

        file_hash = PhoneSyncManager.compute_file_hash(str(inv_path))
        await _log_sync(
            db, original_name, SyncDirection.IMPORT,
            SyncStatus.SUCCESS, imported, file_hash=file_hash,
        )

        return ApiResponse.ok({
            "phones_imported": imported,
            "cash_rate": cash_rate,
            "mukuru_rate": mukuru_rate,
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
async def import_phone_invoice(
    file: UploadFile = File(..., description="Phone invoice Excel file (.xlsx)"),
    month: int = Query(default=None, ge=1, le=12),
    year: int = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Import phone sales, payments, losses from an uploaded invoice file."""
    now = datetime.date.today()
    year = year or now.year
    month = month or now.month

    inv_path = _save_upload(file)
    original_name = file.filename or "phone_invoice.xlsx"

    try:
        data = PhoneSyncManager.import_from_invoice(str(inv_path))
        sales_data = data["sales"]
        payments_data = data["payments"]
        losses_data = data["losses"]
        stats = data["statistics"]

        # Load all phones for matching
        phone_result = await db.execute(select(Phone))
        all_phones = phone_result.scalars().all()

        # Import sales (with duplicate detection)
        sales_count = 0
        skipped_phones: list[str] = []
        duplicates_skipped = 0
        for sd in sales_data:
            raw_brand = (sd.get("brand") or "").strip()
            raw_model = (sd.get("model") or "").strip()
            if not raw_brand and not raw_model:
                continue
            phone_id = _match_phone_id(
                all_phones, raw_brand, raw_model, sd.get("config"),
            )
            if phone_id is None:
                skipped_phones.append(f"{raw_brand} {raw_model}")
                continue

            sale_date = sd.get("date") or datetime.date(year, month, 1)
            qty = sd.get("qty", 0)
            unit_price = sd.get("unit_price", 0)
            raw_discount = sd.get("discount", 0)
            discount_pct = raw_discount * 100 if 0 < raw_discount < 1 else raw_discount
            total = sd.get("total", 0)
            if not total and qty and unit_price:
                total = qty * unit_price * (1 - discount_pct / 100)

            # Check for duplicate
            dup_result = await db.execute(
                select(PhoneSale).where(and_(
                    PhoneSale.sale_date == sale_date,
                    PhoneSale.phone_id == phone_id,
                    PhoneSale.quantity == qty,
                    PhoneSale.unit_price == unit_price,
                ))
            )
            if dup_result.scalar_one_or_none() is not None:
                duplicates_skipped += 1
                continue

            sale = PhoneSale(
                sale_date=sale_date,
                phone_id=phone_id,
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
                product_type="phone",
            )
            db.add(payment)
            pay_count += 1

        # Import losses
        loss_count = 0
        for ld in losses_data:
            raw_brand = (ld.get("brand") or "").strip()
            raw_model = (ld.get("model") or "").strip()
            if not raw_brand and not raw_model:
                continue
            phone_id = _match_phone_id(
                all_phones, raw_brand, raw_model, ld.get("config"),
            )
            if phone_id is None:
                continue

            loss_date = ld.get("date") or datetime.date(year, month, 1)
            exchanged = (ld.get("exchanged") or "").strip().lower()
            if "exchange" in exchanged or exchanged == "yes":
                loss_type = LossType.EXCHANGE
            elif ld.get("refund", 0) > 0 or ld.get("total_refund", 0) > 0:
                loss_type = LossType.REFUND
            else:
                loss_type = LossType.BROKEN

            loss = PhoneLoss(
                loss_date=loss_date,
                phone_id=phone_id,
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
        file_hash = PhoneSyncManager.compute_file_hash(str(inv_path))
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
        if skipped_phones:
            result_data["skipped_phones"] = skipped_phones

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
async def import_phone_daily_sales(
    file: UploadFile = File(..., description="Daily phone sales Excel file (.xlsx)"),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Import phone sales and payments from an uploaded daily sales file."""
    file_path = _save_upload(file)
    original_name = file.filename or "phone_daily_sales.xlsx"

    try:
        data = PhoneSyncManager.import_from_daily_sales(str(file_path))
        sales_data = data["sales"]
        payments_data = data["payments"]

        phone_result = await db.execute(select(Phone))
        all_phones = phone_result.scalars().all()

        # Determine fallback date
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
        skipped_phones: list[str] = []
        duplicates_skipped = 0
        for sd in sales_data:
            raw_brand = (sd.get("brand") or "").strip()
            raw_model = (sd.get("model") or "").strip()
            if not raw_brand and not raw_model:
                continue
            phone_id = _match_phone_id(
                all_phones, raw_brand, raw_model, sd.get("config"),
            )
            if phone_id is None:
                skipped_phones.append(f"{raw_brand} {raw_model}")
                continue

            sale_date = sd.get("date") or fallback_date
            qty = sd.get("qty", 0)
            unit_price = sd.get("unit_price", 0)
            raw_discount = sd.get("discount", 0)
            discount_pct = raw_discount * 100 if 0 < raw_discount < 1 else raw_discount
            total = sd.get("total", 0)
            if not total and qty and unit_price:
                total = qty * unit_price * (1 - discount_pct / 100)

            dup_result = await db.execute(
                select(PhoneSale).where(and_(
                    PhoneSale.sale_date == sale_date,
                    PhoneSale.phone_id == phone_id,
                    PhoneSale.quantity == qty,
                    PhoneSale.unit_price == unit_price,
                ))
            )
            if dup_result.scalar_one_or_none() is not None:
                duplicates_skipped += 1
                continue

            sale = PhoneSale(
                sale_date=sale_date,
                phone_id=phone_id,
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
                product_type="phone",
            )
            db.add(payment)
            pay_count += 1

        total_records = sales_count + pay_count
        file_hash = PhoneSyncManager.compute_file_hash(str(file_path))
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
        if skipped_phones:
            result_data["skipped_phones"] = skipped_phones

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
async def export_phone_inventory(
    month: int = Query(default=None, ge=1, le=12),
    year: int = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Export daily phone sales to the phone inventory Excel file."""
    now = datetime.date.today()
    year = year or now.year
    month = month or now.month

    inv_path = _get_phone_inventory_path()
    if not inv_path.exists():
        return ApiResponse.fail(f"Phone inventory file not found: {inv_path.name}")

    try:
        sheet_created = PhoneExcelWriter.ensure_month_sheet(str(inv_path), month)

        # Build phone_id -> excel_row mapping
        phone_result = await db.execute(
            select(Phone).where(Phone.excel_row.isnot(None))
        )
        phone_map = {p.id: p.excel_row for p in phone_result.scalars().all()}

        # Build stock data from phone_inventory_periods
        inv_periods_result = await db.execute(
            select(PhoneInventoryPeriod).where(
                PhoneInventoryPeriod.year == year,
                PhoneInventoryPeriod.month == month,
            )
        )
        stock_data = []
        for inv in inv_periods_result.scalars().all():
            excel_row = phone_map.get(inv.phone_id)
            if excel_row is not None:
                stock_data.append({
                    "row": excel_row,
                    "initial_stock": inv.initial_stock or 0,
                    "added_stock": inv.added_stock or 0,
                })

        # Get all phone sales for the month, grouped by day and phone
        month_start = datetime.date(year, month, 1)
        month_end = datetime.date(
            year + (1 if month == 12 else 0),
            (month % 12) + 1, 1,
        )
        sales_result = await db.execute(
            select(PhoneSale).where(
                PhoneSale.sale_date >= month_start,
                PhoneSale.sale_date < month_end,
            )
        )
        sales_by_day: dict[int, list[dict]] = {}
        for sale in sales_result.scalars().all():
            day = sale.sale_date.day
            excel_row = phone_map.get(sale.phone_id)
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

        records = PhoneExcelWriter.export_inventory_batch(
            str(inv_path), month, stock_data, sales_by_day
        )

        file_hash = PhoneSyncManager.compute_file_hash(str(inv_path))
        await _log_sync(
            db, inv_path.name, SyncDirection.EXPORT,
            SyncStatus.SUCCESS, records, file_hash=file_hash,
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
async def export_phone_invoice(
    month: int = Query(default=None, ge=1, le=12),
    year: int = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Export phone sales and payments to the phone invoice Excel file."""
    now = datetime.date.today()
    year = year or now.year
    month = month or now.month

    inv_path = _get_phone_invoice_path(year, month)

    file_created = False
    if not inv_path.exists():
        PhoneExcelWriter.create_invoice_file(str(inv_path))
        file_created = True

    try:
        month_start = datetime.date(year, month, 1)
        month_end = datetime.date(
            year + (1 if month == 12 else 0),
            (month % 12) + 1, 1,
        )
        sales_result = await db.execute(
            select(PhoneSale).where(
                PhoneSale.sale_date >= month_start,
                PhoneSale.sale_date < month_end,
            ).order_by(PhoneSale.sale_date, PhoneSale.id)
        )
        sales = sales_result.scalars().all()

        phone_result = await db.execute(select(Phone))
        phone_map = {p.id: p for p in phone_result.scalars().all()}

        sale_dicts = []
        for sale in sales:
            phone = phone_map.get(sale.phone_id)
            sale_dicts.append({
                "date": sale.sale_date,
                "brand": phone.brand if phone else None,
                "model": phone.model if phone else None,
                "config": phone.config if phone else None,
                "qty": sale.quantity,
                "unit_price": sale.unit_price,
                "discount": sale.discount / 100 if sale.discount else 0,
                "payment_method": sale.payment_method.value,
                "customer_name": sale.customer_name,
            })

        # Get phone payments for the month
        pay_result = await db.execute(
            select(Payment).where(
                Payment.payment_date >= month_start,
                Payment.payment_date < month_end,
                Payment.product_type == "phone",
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

        sales_written, payments_written = PhoneExcelWriter.export_invoice_batch(
            str(inv_path), sale_dicts, pay_dicts
        )

        file_hash = PhoneSyncManager.compute_file_hash(str(inv_path))
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
async def download_phone_inventory() -> FileResponse:
    """Download the phone inventory Excel file."""
    inv_path = _get_phone_inventory_path()
    if not inv_path.exists():
        raise HTTPException(status_code=404, detail="Phone inventory file not found")
    return FileResponse(
        path=str(inv_path),
        filename=inv_path.name,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.get("/download/invoice")
async def download_phone_invoice(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
) -> FileResponse:
    """Download the phone invoice Excel file for a specific month."""
    inv_path = _get_phone_invoice_path(year, month)
    if not inv_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Phone invoice file not found: {inv_path.name}",
        )
    return FileResponse(
        path=str(inv_path),
        filename=inv_path.name,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
