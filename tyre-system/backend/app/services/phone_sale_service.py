from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.phone import Phone
from app.models.phone_inventory import PhoneInventoryPeriod
from app.models.phone_sale import PhoneSale
from app.schemas.phone_sale import PhoneSaleCreate, PhoneSaleFilter
from app.services.phone_inventory_service import ensure_phone_inventory_exists


async def _compute_total(quantity: int, unit_price: float, discount: float) -> float:
    """Compute sale total: qty * price * (1 - discount/100)."""
    return round(quantity * unit_price * (1 - discount / 100), 2)


async def _get_remaining_stock(
    db: AsyncSession,
    phone_id: int,
    year: int,
    month: int,
) -> int:
    """Calculate remaining stock for a phone in a given period."""
    inv_result = await db.execute(
        select(PhoneInventoryPeriod).where(
            PhoneInventoryPeriod.phone_id == phone_id,
            PhoneInventoryPeriod.year == year,
            PhoneInventoryPeriod.month == month,
        )
    )
    inv = inv_result.scalar_one_or_none()
    if inv is None:
        return 0

    sold_result = await db.execute(
        select(func.coalesce(func.sum(PhoneSale.quantity), 0)).where(
            PhoneSale.phone_id == phone_id,
            func.extract("year", PhoneSale.sale_date) == year,
            func.extract("month", PhoneSale.sale_date) == month,
        )
    )
    total_sold = sold_result.scalar()
    return inv.initial_stock + inv.added_stock - total_sold


async def create_sale(db: AsyncSession, data: PhoneSaleCreate) -> PhoneSale:
    """Create a new phone sale record after validating stock."""
    phone_result = await db.execute(select(Phone).where(Phone.id == data.phone_id))
    phone = phone_result.scalar_one_or_none()
    if phone is None:
        raise ValueError(f"Phone with id {data.phone_id} not found")

    year = data.sale_date.year
    month = data.sale_date.month
    await ensure_phone_inventory_exists(db, year, month)

    remaining = await _get_remaining_stock(db, data.phone_id, year, month)
    if remaining < data.quantity:
        raise ValueError(
            f"Insufficient stock: {remaining} available, {data.quantity} requested"
        )

    total = await _compute_total(data.quantity, data.unit_price, data.discount)
    sale = PhoneSale(
        sale_date=data.sale_date,
        phone_id=data.phone_id,
        quantity=data.quantity,
        unit_price=data.unit_price,
        discount=data.discount,
        total=total,
        payment_method=data.payment_method,
        customer_name=data.customer_name,
    )
    db.add(sale)
    await db.commit()
    await db.refresh(sale, ["phone"])
    return sale


async def create_sales_bulk(
    db: AsyncSession,
    sales_data: list[PhoneSaleCreate],
) -> list[PhoneSale]:
    """Create multiple phone sales in one transaction."""
    results = []
    for data in sales_data:
        sale = await create_sale(db, data)
        results.append(sale)
    return results


async def get_sales(
    db: AsyncSession,
    filters: PhoneSaleFilter,
) -> tuple[list[PhoneSale], int]:
    """Get phone sales with filters and pagination."""
    query = select(PhoneSale).options(selectinload(PhoneSale.phone))
    count_query = select(func.count(PhoneSale.id))

    if filters.start_date:
        query = query.where(PhoneSale.sale_date >= filters.start_date)
        count_query = count_query.where(PhoneSale.sale_date >= filters.start_date)
    if filters.end_date:
        query = query.where(PhoneSale.sale_date <= filters.end_date)
        count_query = count_query.where(PhoneSale.sale_date <= filters.end_date)
    if filters.phone_id:
        query = query.where(PhoneSale.phone_id == filters.phone_id)
        count_query = count_query.where(PhoneSale.phone_id == filters.phone_id)
    if filters.payment_method:
        query = query.where(PhoneSale.payment_method == filters.payment_method)
        count_query = count_query.where(
            PhoneSale.payment_method == filters.payment_method
        )
    if filters.customer_name:
        query = query.where(
            PhoneSale.customer_name.ilike(f"%{filters.customer_name}%")
        )
        count_query = count_query.where(
            PhoneSale.customer_name.ilike(f"%{filters.customer_name}%")
        )

    total_result = await db.execute(count_query)
    total = total_result.scalar()

    offset = (filters.page - 1) * filters.limit
    query = query.order_by(PhoneSale.sale_date.desc(), PhoneSale.id.desc())
    query = query.offset(offset).limit(filters.limit)

    result = await db.execute(query)
    sales = list(result.scalars().all())
    return sales, total


async def get_daily_sales(db: AsyncSession, target_date: date) -> list[PhoneSale]:
    """Get all phone sales for a specific date."""
    result = await db.execute(
        select(PhoneSale)
        .options(selectinload(PhoneSale.phone))
        .where(PhoneSale.sale_date == target_date)
        .order_by(PhoneSale.id)
    )
    return list(result.scalars().all())


async def get_monthly_sales(
    db: AsyncSession,
    year: int,
    month: int,
) -> list[PhoneSale]:
    """Get all phone sales for a specific month."""
    result = await db.execute(
        select(PhoneSale)
        .options(selectinload(PhoneSale.phone))
        .where(
            func.extract("year", PhoneSale.sale_date) == year,
            func.extract("month", PhoneSale.sale_date) == month,
        )
        .order_by(PhoneSale.sale_date, PhoneSale.id)
    )
    return list(result.scalars().all())


async def delete_sale(db: AsyncSession, sale_id: int) -> bool:
    """Delete a phone sale by ID. Returns True if deleted."""
    result = await db.execute(select(PhoneSale).where(PhoneSale.id == sale_id))
    sale = result.scalar_one_or_none()
    if sale is None:
        return False
    await db.delete(sale)
    await db.commit()
    return True
