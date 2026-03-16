from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.other_product import OtherProduct
from app.models.other_inventory import OtherInventoryPeriod
from app.models.other_sale import OtherSale
from app.schemas.other_sale import OtherSaleCreate, OtherSaleFilter
from app.services.other_inventory_service import ensure_other_inventory_exists


async def _compute_total(quantity: int, unit_price: float, discount: float) -> float:
    """Compute sale total: qty * price * (1 - discount/100)."""
    return round(quantity * unit_price * (1 - discount / 100), 2)


async def _get_remaining_stock(
    db: AsyncSession,
    product_id: int,
    year: int,
    month: int,
) -> int:
    """Calculate remaining stock for an other product in a given period."""
    inv_result = await db.execute(
        select(OtherInventoryPeriod).where(
            OtherInventoryPeriod.other_product_id == product_id,
            OtherInventoryPeriod.year == year,
            OtherInventoryPeriod.month == month,
        )
    )
    inv = inv_result.scalar_one_or_none()
    if inv is None:
        return 0

    sold_result = await db.execute(
        select(func.coalesce(func.sum(OtherSale.quantity), 0)).where(
            OtherSale.other_product_id == product_id,
            func.extract("year", OtherSale.sale_date) == year,
            func.extract("month", OtherSale.sale_date) == month,
        )
    )
    total_sold = sold_result.scalar()
    return inv.initial_stock + inv.added_stock - total_sold


async def create_sale(db: AsyncSession, data: OtherSaleCreate) -> OtherSale:
    """Create a new other product sale record after validating stock."""
    product_result = await db.execute(
        select(OtherProduct).where(OtherProduct.id == data.other_product_id)
    )
    product = product_result.scalar_one_or_none()
    if product is None:
        raise ValueError(f"Other product with id {data.other_product_id} not found")

    year = data.sale_date.year
    month = data.sale_date.month
    await ensure_other_inventory_exists(db, year, month)

    remaining = await _get_remaining_stock(db, data.other_product_id, year, month)
    if remaining < data.quantity:
        raise ValueError(
            f"Insufficient stock: {remaining} available, {data.quantity} requested"
        )

    total = await _compute_total(data.quantity, data.unit_price, data.discount)
    sale = OtherSale(
        sale_date=data.sale_date,
        other_product_id=data.other_product_id,
        quantity=data.quantity,
        unit_price=data.unit_price,
        discount=data.discount,
        total=total,
        payment_method=data.payment_method,
        customer_name=data.customer_name,
    )
    db.add(sale)
    await db.commit()
    await db.refresh(sale, ["other_product"])
    return sale


async def create_sales_bulk(
    db: AsyncSession,
    sales_data: list[OtherSaleCreate],
) -> list[OtherSale]:
    """Create multiple other product sales in one transaction."""
    results = []
    for data in sales_data:
        sale = await create_sale(db, data)
        results.append(sale)
    return results


async def get_sales(
    db: AsyncSession,
    filters: OtherSaleFilter,
) -> tuple[list[OtherSale], int]:
    """Get other product sales with filters and pagination."""
    query = select(OtherSale).options(selectinload(OtherSale.other_product))
    count_query = select(func.count(OtherSale.id))

    if filters.start_date:
        query = query.where(OtherSale.sale_date >= filters.start_date)
        count_query = count_query.where(OtherSale.sale_date >= filters.start_date)
    if filters.end_date:
        query = query.where(OtherSale.sale_date <= filters.end_date)
        count_query = count_query.where(OtherSale.sale_date <= filters.end_date)
    if filters.other_product_id:
        query = query.where(OtherSale.other_product_id == filters.other_product_id)
        count_query = count_query.where(
            OtherSale.other_product_id == filters.other_product_id
        )
    if filters.payment_method:
        query = query.where(OtherSale.payment_method == filters.payment_method)
        count_query = count_query.where(
            OtherSale.payment_method == filters.payment_method
        )
    if filters.customer_name:
        query = query.where(
            OtherSale.customer_name.ilike(f"%{filters.customer_name}%")
        )
        count_query = count_query.where(
            OtherSale.customer_name.ilike(f"%{filters.customer_name}%")
        )

    total_result = await db.execute(count_query)
    total = total_result.scalar()

    offset = (filters.page - 1) * filters.limit
    query = query.order_by(OtherSale.sale_date.desc(), OtherSale.id.desc())
    query = query.offset(offset).limit(filters.limit)

    result = await db.execute(query)
    sales = list(result.scalars().all())
    return sales, total


async def get_daily_sales(db: AsyncSession, target_date: date) -> list[OtherSale]:
    """Get all other product sales for a specific date."""
    result = await db.execute(
        select(OtherSale)
        .options(selectinload(OtherSale.other_product))
        .where(OtherSale.sale_date == target_date)
        .order_by(OtherSale.id)
    )
    return list(result.scalars().all())


async def get_monthly_sales(
    db: AsyncSession,
    year: int,
    month: int,
) -> list[OtherSale]:
    """Get all other product sales for a specific month."""
    result = await db.execute(
        select(OtherSale)
        .options(selectinload(OtherSale.other_product))
        .where(
            func.extract("year", OtherSale.sale_date) == year,
            func.extract("month", OtherSale.sale_date) == month,
        )
        .order_by(OtherSale.sale_date, OtherSale.id)
    )
    return list(result.scalars().all())


async def delete_sale(db: AsyncSession, sale_id: int) -> bool:
    """Delete an other product sale by ID. Returns True if deleted."""
    result = await db.execute(select(OtherSale).where(OtherSale.id == sale_id))
    sale = result.scalar_one_or_none()
    if sale is None:
        return False
    await db.delete(sale)
    await db.commit()
    return True
