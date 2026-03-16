import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.other_product import OtherProduct
from app.models.other_inventory import OtherInventoryPeriod
from app.models.other_loss import OtherLoss
from app.models.other_sale import OtherSale

logger = logging.getLogger(__name__)


async def get_other_inventory(
    db: AsyncSession,
    year: int,
    month: int,
) -> list[dict]:
    """Get inventory for all other products in a given period with remaining stock."""
    products_result = await db.execute(select(OtherProduct).order_by(OtherProduct.id))
    products = list(products_result.scalars().all())

    inventory_items = []
    for product in products:
        inv_result = await db.execute(
            select(OtherInventoryPeriod).where(
                OtherInventoryPeriod.other_product_id == product.id,
                OtherInventoryPeriod.year == year,
                OtherInventoryPeriod.month == month,
            )
        )
        inv = inv_result.scalar_one_or_none()

        initial_stock = inv.initial_stock if inv else 0
        added_stock = inv.added_stock if inv else 0

        sold_result = await db.execute(
            select(func.coalesce(func.sum(OtherSale.quantity), 0)).where(
                OtherSale.other_product_id == product.id,
                func.extract("year", OtherSale.sale_date) == year,
                func.extract("month", OtherSale.sale_date) == month,
            )
        )
        total_sold = sold_result.scalar()

        loss_result = await db.execute(
            select(func.coalesce(func.sum(OtherLoss.quantity), 0)).where(
                OtherLoss.other_product_id == product.id,
                func.extract("year", OtherLoss.loss_date) == year,
                func.extract("month", OtherLoss.loss_date) == month,
            )
        )
        total_loss = loss_result.scalar()

        remaining = initial_stock + added_stock - total_sold - total_loss

        inventory_items.append({
            "other_product_id": product.id,
            "name": product.name,
            "category": product.category,
            "note": product.note,
            "cost": product.cost,
            "suggested_price": product.suggested_price,
            "year": year,
            "month": month,
            "initial_stock": initial_stock,
            "added_stock": added_stock,
            "total_sold": total_sold,
            "total_loss": total_loss,
            "remaining_stock": remaining,
        })

    return inventory_items


async def update_other_stock(
    db: AsyncSession,
    product_id: int,
    year: int,
    month: int,
    initial_stock: int | None = None,
    added_stock: int | None = None,
) -> OtherInventoryPeriod:
    """Update or create inventory stock for an other product in a period."""
    result = await db.execute(
        select(OtherInventoryPeriod).where(
            OtherInventoryPeriod.other_product_id == product_id,
            OtherInventoryPeriod.year == year,
            OtherInventoryPeriod.month == month,
        )
    )
    inv = result.scalar_one_or_none()

    if inv is None:
        inv = OtherInventoryPeriod(
            other_product_id=product_id,
            year=year,
            month=month,
            initial_stock=initial_stock or 0,
            added_stock=added_stock or 0,
        )
        db.add(inv)
    else:
        if initial_stock is not None:
            inv.initial_stock = initial_stock
        if added_stock is not None:
            inv.added_stock = added_stock

    await db.commit()
    return inv


async def ensure_other_inventory_exists(
    db: AsyncSession,
    year: int,
    month: int,
) -> bool:
    """Ensure other product inventory records exist for a given month.

    If none exist, auto-rollover from the most recent month that has records.
    """
    count_result = await db.execute(
        select(func.count(OtherInventoryPeriod.id)).where(
            OtherInventoryPeriod.year == year,
            OtherInventoryPeriod.month == month,
        )
    )
    if count_result.scalar() > 0:
        return True

    for i in range(1, 13):
        prev_month = month - i
        prev_year = year
        while prev_month <= 0:
            prev_month += 12
            prev_year -= 1

        prev_count_result = await db.execute(
            select(func.count(OtherInventoryPeriod.id)).where(
                OtherInventoryPeriod.year == prev_year,
                OtherInventoryPeriod.month == prev_month,
            )
        )
        if prev_count_result.scalar() > 0:
            count = await rollover_other_month(
                db, prev_year, prev_month, year, month
            )
            logger.info(
                "Other auto-rollover: %d/%d -> %d/%d (%d records)",
                prev_year, prev_month, year, month, count,
            )
            return True

    return False


async def get_other_low_stock(
    db: AsyncSession,
    year: int,
    month: int,
    threshold: int | None = None,
) -> list[dict]:
    """Get other products with remaining stock below threshold."""
    if threshold is None:
        threshold = settings.LOW_STOCK_THRESHOLD

    all_inventory = await get_other_inventory(db, year, month)
    return [item for item in all_inventory if item["remaining_stock"] < threshold]


async def rollover_other_month(
    db: AsyncSession,
    from_year: int,
    from_month: int,
    to_year: int,
    to_month: int,
) -> int:
    """Roll over other product inventory from one month to the next."""
    source_inventory = await get_other_inventory(db, from_year, from_month)
    count = 0

    for item in source_inventory:
        remaining = item["remaining_stock"]

        existing_result = await db.execute(
            select(OtherInventoryPeriod).where(
                OtherInventoryPeriod.other_product_id == item["other_product_id"],
                OtherInventoryPeriod.year == to_year,
                OtherInventoryPeriod.month == to_month,
            )
        )
        existing = existing_result.scalar_one_or_none()

        if existing is not None:
            if existing.initial_stock != remaining:
                existing.initial_stock = remaining
                count += 1
            continue

        new_inv = OtherInventoryPeriod(
            other_product_id=item["other_product_id"],
            year=to_year,
            month=to_month,
            initial_stock=remaining,
            added_stock=0,
        )
        db.add(new_inv)
        count += 1

    await db.commit()
    return count
