"""Initial import script.

Reads existing Excel files and populates the database with:
- Tyre master data (from inventory file)
- Inventory periods (from inventory file)
- Sales, payments, losses (from invoice file)
- Exchange rates
- Default admin user

Usage:
    cd tyre-system/backend
    python -m scripts.initial_import

Or:
    cd tyre-system
    python scripts/initial_import.py
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
from app.excel.reader import ExcelReader
from app.models.exchange_rate import ExchangeRate, RateType
from app.models.inventory import InventoryPeriod
from app.models.loss import Loss, LossType
from app.models.payment import Payment
from app.models.sale import PaymentMethod, Sale
from app.models.tyre import Tyre, TyreCategory
from app.models.user import User, UserRole
from app.utils.auth import hash_password

# Excel files are in Tyres_Record, sibling to the tyre-system project directory
# tyre-system/../Tyres_Record/
EXCEL_DIR = PROJECT_DIR.parent / "Tyres_Record"
INVENTORY_FILE = EXCEL_DIR / "Tyre_List_Internal_Available.xlsx"
INVOICE_FILE = EXCEL_DIR / "Invoice_Tyres_2026.1.xlsx"
CURRENT_MONTH = 1
CURRENT_YEAR = 2026


def _classify_tyre(type_str: str | None, brand: str | None) -> TyreCategory:
    """Determine tyre category from type and brand fields."""
    t = (type_str or "").strip().lower()
    if "second" in t:
        return TyreCategory.SECOND_HAND
    if "brandless" in t or "new but brandless" in t:
        return TyreCategory.BRANDLESS_NEW
    if brand and brand.strip():
        return TyreCategory.BRANDED_NEW
    return TyreCategory.BRANDLESS_NEW


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


async def import_tyres_and_inventory(
    session: object,
) -> dict[int, int]:
    """Import tyres and inventory from the inventory Excel file.

    Returns a mapping of excel_row -> tyre.id for use by other imports.
    """
    print(f"Reading inventory from {INVENTORY_FILE}...")
    tyres_data = ExcelReader.read_inventory(str(INVENTORY_FILE), CURRENT_MONTH)
    print(f"  Found {len(tyres_data)} tyre entries")

    row_to_id: dict[int, int] = {}

    for td in tyres_data:
        category = _classify_tyre(td["type"], td["brand"])

        tyre = Tyre(
            size=td["size"],
            type_=td["type"] or "Unknown",
            brand=td["brand"],
            pattern=td["pattern"],
            li_sr=td["li_sr"],
            tyre_cost=td["tyre_cost"],
            suggested_price=td.get("suggested_price", 0.0),
            category=category,
            excel_row=td["row"],
        )
        session.add(tyre)
        await session.flush()  # get the id

        row_to_id[td["row"]] = tyre.id

        # Create inventory period
        inv = InventoryPeriod(
            tyre_id=tyre.id,
            year=CURRENT_YEAR,
            month=CURRENT_MONTH,
            initial_stock=td["initial_stock"],
            added_stock=td["added_stock"],
        )
        session.add(inv)

    await session.flush()
    print(f"  Imported {len(row_to_id)} tyres with inventory")
    return row_to_id


async def import_exchange_rates(session: object) -> None:
    """Import exchange rates from both inventory and invoice files."""
    print("Importing exchange rates...")

    # From inventory file (I54)
    try:
        inv_rate = ExcelReader.read_exchange_rate(
            str(INVENTORY_FILE), CURRENT_MONTH
        )
        print(f"  Inventory exchange rate: {inv_rate}")
    except Exception as e:
        print(f"  Warning: Could not read inventory rate: {e}")
        inv_rate = settings.DEFAULT_EXCHANGE_RATE

    # From invoice file (Statistic sheet)
    try:
        stats = ExcelReader.read_invoice_statistics(str(INVOICE_FILE))
        mukuru_rate = stats.get("mukuru_rate", inv_rate)
        cash_rate = stats.get("cash_rate", inv_rate)
        print(f"  Invoice rates - Mukuru: {mukuru_rate}, Cash: {cash_rate}")
    except Exception as e:
        print(f"  Warning: Could not read invoice rates: {e}")
        mukuru_rate = inv_rate
        cash_rate = inv_rate

    session.add(ExchangeRate(
        year=CURRENT_YEAR,
        month=CURRENT_MONTH,
        rate_type=RateType.MUKURU,
        rate=mukuru_rate,
    ))
    session.add(ExchangeRate(
        year=CURRENT_YEAR,
        month=CURRENT_MONTH,
        rate_type=RateType.CASH,
        rate=cash_rate,
    ))
    await session.flush()
    print("  Exchange rates imported")


async def import_sales(
    session: object,
    size_to_tyre_id: dict[str, int],
) -> None:
    """Import sales from the invoice file."""
    print(f"Reading sales from {INVOICE_FILE}...")

    try:
        sales_data = ExcelReader.read_invoice_sales(str(INVOICE_FILE))
    except Exception as e:
        print(f"  Warning: Could not read sales: {e}")
        return

    print(f"  Found {len(sales_data)} sales records")
    imported = 0

    for sd in sales_data:
        size = (sd.get("size") or "").strip()
        tyre_id = size_to_tyre_id.get(size.upper())

        if tyre_id is None:
            # Try without case sensitivity
            for k, v in size_to_tyre_id.items():
                if k.upper() == size.upper():
                    tyre_id = v
                    break

        if tyre_id is None:
            print(f"  Warning: No tyre found for size '{size}', skipping sale")
            continue

        sale_date = sd.get("date")
        if sale_date is None:
            sale_date = datetime.date(CURRENT_YEAR, CURRENT_MONTH, 1)

        qty = sd.get("qty", 0)
        unit_price = sd.get("unit_price", 0)
        discount = sd.get("discount", 0)
        total = sd.get("total", 0)
        if not total and qty and unit_price:
            total = qty * unit_price * (1 - discount)

        sale = Sale(
            sale_date=sale_date,
            tyre_id=tyre_id,
            quantity=qty,
            unit_price=unit_price,
            discount=discount,
            total=total,
            payment_method=_map_payment_method(sd.get("payment_method")),
            customer_name=sd.get("customer_name"),
            synced=True,
        )
        session.add(sale)
        imported += 1

    await session.flush()
    print(f"  Imported {imported} sales")


async def import_payments(session: object) -> None:
    """Import payments from the invoice file."""
    print("Reading payments...")

    try:
        payments_data = ExcelReader.read_invoice_payments(str(INVOICE_FILE))
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
        )
        session.add(payment)
        imported += 1

    await session.flush()
    print(f"  Imported {imported} payments")


async def import_losses(
    session: object,
    size_to_tyre_id: dict[str, int],
) -> None:
    """Import losses from the invoice file."""
    print("Reading losses...")

    try:
        losses_data = ExcelReader.read_invoice_losses(str(INVOICE_FILE))
    except Exception as e:
        print(f"  Warning: Could not read losses: {e}")
        return

    print(f"  Found {len(losses_data)} loss records")
    imported = 0

    for ld in losses_data:
        config = (ld.get("config") or "").strip()
        tyre_id = size_to_tyre_id.get(config.upper())

        if tyre_id is None:
            for k, v in size_to_tyre_id.items():
                if k.upper() == config.upper():
                    tyre_id = v
                    break

        if tyre_id is None:
            print(f"  Warning: No tyre found for config '{config}', skipping loss")
            continue

        loss_date = ld.get("date")
        if loss_date is None:
            loss_date = datetime.date(CURRENT_YEAR, CURRENT_MONTH, 1)

        # Determine loss type from 'exchanged' field
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
        session.add(loss)
        imported += 1

    await session.flush()
    print(f"  Imported {imported} losses")


async def create_admin_user(session: object) -> None:
    """Create default admin user."""
    print("Creating admin user...")
    from sqlalchemy import select

    result = await session.execute(select(User).limit(1))
    if result.scalar_one_or_none() is not None:
        print("  Admin user already exists, skipping")
        return

    admin = User(
        username="admin",
        password_hash=hash_password("admin"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    session.add(admin)
    await session.flush()
    print("  Admin user created (username: admin, password: admin)")


async def main() -> None:
    """Run the initial import."""
    print("=" * 60)
    print("Tyre System - Initial Import")
    print("=" * 60)
    print()

    # Verify files exist
    if not INVENTORY_FILE.exists():
        print(f"ERROR: Inventory file not found: {INVENTORY_FILE}")
        sys.exit(1)
    if not INVOICE_FILE.exists():
        print(f"ERROR: Invoice file not found: {INVOICE_FILE}")
        sys.exit(1)

    # Ensure data directory exists
    settings.DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Initialize database
    print("Initializing database...")
    await init_db()
    print("  Database initialized\n")

    async with async_session_factory() as session:
        try:
            # 1. Import tyres and inventory
            row_to_id = await import_tyres_and_inventory(session)

            # Build size -> tyre_id mapping for sales/losses import
            from sqlalchemy import select
            result = await session.execute(select(Tyre))
            all_tyres = result.scalars().all()
            size_to_tyre_id: dict[str, int] = {}
            for t in all_tyres:
                size_to_tyre_id[t.size.upper()] = t.id

            print()

            # 2. Import exchange rates
            await import_exchange_rates(session)
            print()

            # 3. Import sales
            await import_sales(session, size_to_tyre_id)
            print()

            # 4. Import payments
            await import_payments(session)
            print()

            # 5. Import losses
            await import_losses(session, size_to_tyre_id)
            print()

            # 6. Create admin user
            await create_admin_user(session)

            await session.commit()
            print()
            print("=" * 60)
            print("Import completed successfully!")
            print("=" * 60)

        except Exception as e:
            await session.rollback()
            print(f"\nERROR: Import failed: {e}")
            raise


if __name__ == "__main__":
    asyncio.run(main())
