from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.inventory import InventoryPeriod
from app.models.sale import PaymentMethod, Sale
from app.models.tyre import Tyre
from app.schemas.sale import SaleCreate, SaleFilter
from app.services.inventory_service import ensure_inventory_exists


async def _compute_total(quantity: int, unit_price: float, discount: float) -> float:
    """Compute sale total: qty * price * (1 - discount/100)."""
    return round(quantity * unit_price * (1 - discount / 100), 2)


async def _get_remaining_stock(
    db: AsyncSession,
    tyre_id: int,
    year: int,
    month: int,
) -> int:
    """Calculate remaining stock for a tyre in a given period."""
    inv_result = await db.execute(
        select(InventoryPeriod).where(
            InventoryPeriod.tyre_id == tyre_id,
            InventoryPeriod.year == year,
            InventoryPeriod.month == month,
        )
    )
    inv = inv_result.scalar_one_or_none()
    if inv is None:
        return 0

    sold_result = await db.execute(
        select(func.coalesce(func.sum(Sale.quantity), 0)).where(
            Sale.tyre_id == tyre_id,
            func.extract("year", Sale.sale_date) == year,
            func.extract("month", Sale.sale_date) == month,
        )
    )
    total_sold = sold_result.scalar()
    return inv.initial_stock + inv.added_stock - total_sold


async def create_sale(db: AsyncSession, data: SaleCreate) -> Sale:
    """Create a new sale record after validating stock."""
    # Verify tyre exists
    tyre_result = await db.execute(select(Tyre).where(Tyre.id == data.tyre_id))
    tyre = tyre_result.scalar_one_or_none()
    if tyre is None:
        raise ValueError(f"Tyre with id {data.tyre_id} not found")

    # Ensure inventory exists for this month (auto-rollover if needed)
    year = data.sale_date.year
    month = data.sale_date.month
    await ensure_inventory_exists(db, year, month)

    # Check stock availability
    remaining = await _get_remaining_stock(db, data.tyre_id, year, month)
    if remaining < data.quantity:
        raise ValueError(
            f"Insufficient stock: {remaining} available, {data.quantity} requested"
        )

    total = await _compute_total(data.quantity, data.unit_price, data.discount)
    sale = Sale(
        sale_date=data.sale_date,
        tyre_id=data.tyre_id,
        quantity=data.quantity,
        unit_price=data.unit_price,
        discount=data.discount,
        total=total,
        payment_method=data.payment_method,
        customer_name=data.customer_name,
    )
    db.add(sale)
    await db.commit()
    # Eagerly load tyre relationship for response serialization
    await db.refresh(sale, ["tyre"])
    return sale


async def create_sales_bulk(
    db: AsyncSession,
    sales_data: list[SaleCreate],
) -> list[Sale]:
    """Create multiple sales in one transaction."""
    results = []
    for data in sales_data:
        sale = await create_sale(db, data)
        results.append(sale)
    return results


async def get_sales(
    db: AsyncSession,
    filters: SaleFilter,
) -> tuple[list[Sale], int]:
    """Get sales with filters and pagination. Returns (sales, total_count)."""
    query = select(Sale).options(selectinload(Sale.tyre))
    count_query = select(func.count(Sale.id))

    if filters.start_date:
        query = query.where(Sale.sale_date >= filters.start_date)
        count_query = count_query.where(Sale.sale_date >= filters.start_date)
    if filters.end_date:
        query = query.where(Sale.sale_date <= filters.end_date)
        count_query = count_query.where(Sale.sale_date <= filters.end_date)
    if filters.tyre_id:
        query = query.where(Sale.tyre_id == filters.tyre_id)
        count_query = count_query.where(Sale.tyre_id == filters.tyre_id)
    if filters.payment_method:
        query = query.where(Sale.payment_method == filters.payment_method)
        count_query = count_query.where(Sale.payment_method == filters.payment_method)
    if filters.customer_name:
        query = query.where(Sale.customer_name.ilike(f"%{filters.customer_name}%"))
        count_query = count_query.where(
            Sale.customer_name.ilike(f"%{filters.customer_name}%")
        )

    total_result = await db.execute(count_query)
    total = total_result.scalar()

    offset = (filters.page - 1) * filters.limit
    query = query.order_by(Sale.sale_date.desc(), Sale.id.desc())
    query = query.offset(offset).limit(filters.limit)

    result = await db.execute(query)
    sales = list(result.scalars().all())
    return sales, total


async def get_daily_sales(db: AsyncSession, target_date: date) -> list[Sale]:
    """Get all sales for a specific date."""
    result = await db.execute(
        select(Sale)
        .options(selectinload(Sale.tyre))
        .where(Sale.sale_date == target_date)
        .order_by(Sale.id)
    )
    return list(result.scalars().all())


async def get_monthly_sales(
    db: AsyncSession,
    year: int,
    month: int,
) -> list[Sale]:
    """Get all sales for a specific month."""
    result = await db.execute(
        select(Sale)
        .options(selectinload(Sale.tyre))
        .where(
            func.extract("year", Sale.sale_date) == year,
            func.extract("month", Sale.sale_date) == month,
        )
        .order_by(Sale.sale_date, Sale.id)
    )
    return list(result.scalars().all())


async def delete_sale(db: AsyncSession, sale_id: int) -> bool:
    """Delete a sale by ID. Returns True if deleted."""
    result = await db.execute(select(Sale).where(Sale.id == sale_id))
    sale = result.scalar_one_or_none()
    if sale is None:
        return False
    await db.delete(sale)
    await db.commit()
    return True
