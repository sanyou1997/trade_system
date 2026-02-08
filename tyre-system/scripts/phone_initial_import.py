"""Phone initial import script.

Reads phone Excel files and populates the database with:
- Phone master data (from inventory file)
- Phone inventory periods (from inventory file)
- Phone sales, payments, losses (from invoice file)
- Exchange rates

Usage:
    cd tyre-system/backend
    python -m scripts.phone_initial_import

Or:
    cd tyre-system
    python scripts/phone_initial_import.py
"""

from __future__ import annotations

import asyncio
import datetime
import sys
from pathlib import Path

# Add backend to path so we can import app modules
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
BACKEND_DIR = PROJECT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.config import settings
from app.database import async_session_factory, init_db
from app.excel.phone_reader import PhoneExcelReader
from app.models.exchange_rate import ExchangeRate, RateType
from app.models.phone import Phone
from app.models.phone_inventory import PhoneInventoryPeriod
from app.models.phone_loss import PhoneLoss
from app.models.phone_sale import PhoneSale
from app.models.loss import LossType
from app.models.payment import Payment
from app.models.sale import PaymentMethod

# Phone Excel files
PHONE_EXCEL_DIR = Path(r"D:\OneDrive\桌面\2024SP")
INVENTORY_FILE = PHONE_EXCEL_DIR / "2025\u624b\u673a_MW Quotation.xlsx"  # 2025手机_MW Quotation.xlsx
INVOICE_DIR = PHONE_EXCEL_DIR / "Sale Record" / "2025"
INVOICE_FILE = INVOICE_DIR / "Invoice_Phones_2026.1.xlsx"

CURRENT_MONTH = 1
CURRENT_YEAR = 2026


def _normalize(value: str | None) -> str:
    if not value:
        return ""
    return value.strip().lower()


def _map_payment_method(method: str | None) -> PaymentMethod:
    """Map Excel payment method string to enum."""
    if not method:
        return PaymentMethod.CASH
    m = method.strip().lower()
    if "mukuru" in m:
        return PaymentMethod.MUKURU
    if "card" in m:
        return PaymentMethod.CARD
    return PaymentMethod.CASH


async def import_phones_and_inventory(session: object) -> dict[str, int]:
    """Import phones and inventory from the phone inventory Excel file.

    Returns a mapping of "brand|model|config" -> phone.id for use by other imports.
    """
    print(f"Reading phone inventory from {INVENTORY_FILE}...")
    phones_data = PhoneExcelReader.read_inventory(str(INVENTORY_FILE), CURRENT_MONTH)
    print(f"  Found {len(phones_data)} phone entries")

    key_to_id: dict[str, int] = {}

    for pd in phones_data:
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
        session.add(phone)
        await session.flush()

        key = f"{_normalize(pd['brand'])}|{_normalize(pd['model'])}|{_normalize(pd['config'])}"
        key_to_id[key] = phone.id

        # Create inventory period
        inv = PhoneInventoryPeriod(
            phone_id=phone.id,
            year=CURRENT_YEAR,
            month=CURRENT_MONTH,
            initial_stock=pd["initial_stock"],
            added_stock=pd["added_stock"],
        )
        session.add(inv)

    await session.flush()
    print(f"  Imported {len(key_to_id)} phones with inventory")
    return key_to_id


async def import_exchange_rates(session: object) -> None:
    """Import exchange rates from the phone inventory file."""
    print("Importing phone exchange rates...")

    try:
        rates = PhoneExcelReader.read_exchange_rates(str(INVENTORY_FILE), CURRENT_MONTH)
        cash_rate = rates["cash_rate"]
        mukuru_rate = rates["mukuru_rate"]
        print(f"  Cash rate: {cash_rate}, Mukuru rate: {mukuru_rate}")
    except Exception as e:
        print(f"  Warning: Could not read rates: {e}")
        cash_rate = settings.DEFAULT_EXCHANGE_RATE
        mukuru_rate = settings.DEFAULT_EXCHANGE_RATE

    # Only add if rates don't already exist (tyre import may have added them)
    from sqlalchemy import select

    for rt, rv in [(RateType.CASH, cash_rate), (RateType.MUKURU, mukuru_rate)]:
        if rv <= 0:
            continue
        result = await session.execute(
            select(ExchangeRate).where(
                ExchangeRate.year == CURRENT_YEAR,
                ExchangeRate.month == CURRENT_MONTH,
                ExchangeRate.rate_type == rt,
            )
        )
        existing = result.scalar_one_or_none()
        if existing is None:
            session.add(ExchangeRate(
                year=CURRENT_YEAR, month=CURRENT_MONTH,
                rate_type=rt, rate=rv,
            ))

    await session.flush()
    print("  Exchange rates imported")


def _match_phone_id(
    key_to_id: dict[str, int],
    brand: str | None,
    model: str | None,
    config: str | None,
) -> int | None:
    """Match a phone ID using brand + model + config."""
    # Exact match
    key = f"{_normalize(brand)}|{_normalize(model)}|{_normalize(config)}"
    if key in key_to_id:
        return key_to_id[key]

    # Fallback: brand + model only (match any config)
    prefix = f"{_normalize(brand)}|{_normalize(model)}|"
    for k, v in key_to_id.items():
        if k.startswith(prefix):
            return v

    return None


async def import_sales(
    session: object,
    key_to_id: dict[str, int],
) -> None:
    """Import phone sales from the invoice file."""
    if not INVOICE_FILE.exists():
        print(f"  Invoice file not found: {INVOICE_FILE}, skipping sales import")
        return

    print(f"Reading phone sales from {INVOICE_FILE}...")

    try:
        sales_data = PhoneExcelReader.read_invoice_sales(str(INVOICE_FILE))
    except Exception as e:
        print(f"  Warning: Could not read sales: {e}")
        return

    print(f"  Found {len(sales_data)} sales records")
    imported = 0
    skipped = 0

    for sd in sales_data:
        brand = (sd.get("brand") or "").strip()
        model = (sd.get("model") or "").strip()
        if not brand and not model:
            continue

        phone_id = _match_phone_id(key_to_id, brand, model, sd.get("config"))
        if phone_id is None:
            print(f"  Warning: No phone found for '{brand} {model}', skipping sale")
            skipped += 1
            continue

        sale_date = sd.get("date")
        if sale_date is None:
            sale_date = datetime.date(CURRENT_YEAR, CURRENT_MONTH, 1)

        qty = sd.get("qty", 0)
        unit_price = sd.get("unit_price", 0)
        raw_discount = sd.get("discount", 0)
        discount_pct = raw_discount * 100 if 0 < raw_discount < 1 else raw_discount
        total = sd.get("total", 0)
        if not total and qty and unit_price:
            total = qty * unit_price * (1 - discount_pct / 100)

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
        session.add(sale)
        imported += 1

    await session.flush()
    print(f"  Imported {imported} sales ({skipped} skipped)")


async def import_payments(session: object) -> None:
    """Import phone payments from the invoice file."""
    if not INVOICE_FILE.exists():
        print(f"  Invoice file not found, skipping payments import")
        return

    print("Reading phone payments...")

    try:
        payments_data = PhoneExcelReader.read_invoice_payments(str(INVOICE_FILE))
    except Exception as e:
        print(f"  Warning: Could not read payments: {e}")
        return

    print(f"  Found {len(payments_data)} payment records")
    imported = 0

    for pd_item in payments_data:
        pay_date = pd_item.get("date")
        if pay_date is None:
            pay_date = datetime.date(CURRENT_YEAR, CURRENT_MONTH, 1)

        payment = Payment(
            payment_date=pay_date,
            customer=pd_item.get("customer") or "Unknown",
            payment_method=pd_item.get("payment_method") or "Cash",
            amount_mwk=pd_item.get("amount_mwk", 0),
            product_type="phone",
        )
        session.add(payment)
        imported += 1

    await session.flush()
    print(f"  Imported {imported} payments")


async def import_losses(
    session: object,
    key_to_id: dict[str, int],
) -> None:
    """Import phone losses from the invoice file."""
    if not INVOICE_FILE.exists():
        print(f"  Invoice file not found, skipping losses import")
        return

    print("Reading phone losses...")

    try:
        losses_data = PhoneExcelReader.read_invoice_losses(str(INVOICE_FILE))
    except Exception as e:
        print(f"  Warning: Could not read losses: {e}")
        return

    print(f"  Found {len(losses_data)} loss records")
    imported = 0

    for ld in losses_data:
        brand = (ld.get("brand") or "").strip()
        model = (ld.get("model") or "").strip()
        if not brand and not model:
            continue

        phone_id = _match_phone_id(key_to_id, brand, model, ld.get("config"))
        if phone_id is None:
            print(f"  Warning: No phone found for '{brand} {model}', skipping loss")
            continue

        loss_date = ld.get("date")
        if loss_date is None:
            loss_date = datetime.date(CURRENT_YEAR, CURRENT_MONTH, 1)

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
        session.add(loss)
        imported += 1

    await session.flush()
    print(f"  Imported {imported} losses")


async def main() -> None:
    """Run the phone initial import."""
    print("=" * 60)
    print("Phone System - Initial Import")
    print("=" * 60)
    print()

    # Verify inventory file exists
    if not INVENTORY_FILE.exists():
        print(f"ERROR: Phone inventory file not found: {INVENTORY_FILE}")
        print("  Please verify the path is correct.")
        sys.exit(1)

    # Ensure data directory exists
    settings.DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Initialize database
    print("Initializing database...")
    await init_db()
    print("  Database initialized\n")

    async with async_session_factory() as session:
        try:
            # 1. Import phones and inventory
            key_to_id = await import_phones_and_inventory(session)
            print()

            # 2. Import exchange rates
            await import_exchange_rates(session)
            print()

            # 3. Import sales (if invoice file exists)
            await import_sales(session, key_to_id)
            print()

            # 4. Import payments
            await import_payments(session)
            print()

            # 5. Import losses
            await import_losses(session, key_to_id)

            await session.commit()
            print()
            print("=" * 60)
            print("Phone import completed successfully!")
            print("=" * 60)

        except Exception as e:
            await session.rollback()
            print(f"\nERROR: Phone import failed: {e}")
            raise


if __name__ == "__main__":
    asyncio.run(main())
