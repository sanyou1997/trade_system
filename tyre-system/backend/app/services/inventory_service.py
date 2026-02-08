import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.inventory import InventoryPeriod
from app.models.loss import Loss
from app.models.sale import Sale
from app.models.tyre import Tyre

logger = logging.getLogger(__name__)


async def get_inventory(
    db: AsyncSession,
    year: int,
    month: int,
) -> list[dict]:
    """Get inventory for all tyres in a given period with remaining stock."""
    tyres_result = await db.execute(select(Tyre).order_by(Tyre.id))
    tyres = list(tyres_result.scalars().all())

    inventory_items = []
    for tyre in tyres:
        inv_result = await db.execute(
            select(InventoryPeriod).where(
                InventoryPeriod.tyre_id == tyre.id,
                InventoryPeriod.year == year,
                InventoryPeriod.month == month,
            )
        )
        inv = inv_result.scalar_one_or_none()

        initial_stock = inv.initial_stock if inv else 0
        added_stock = inv.added_stock if inv else 0

        sold_result = await db.execute(
            select(func.coalesce(func.sum(Sale.quantity), 0)).where(
                Sale.tyre_id == tyre.id,
                func.extract("year", Sale.sale_date) == year,
                func.extract("month", Sale.sale_date) == month,
            )
        )
        total_sold = sold_result.scalar()

        loss_result = await db.execute(
            select(func.coalesce(func.sum(Loss.quantity), 0)).where(
                Loss.tyre_id == tyre.id,
                func.extract("year", Loss.loss_date) == year,
                func.extract("month", Loss.loss_date) == month,
            )
        )
        total_loss = loss_result.scalar()

        remaining = initial_stock + added_stock - total_sold - total_loss

        inventory_items.append({
            "tyre_id": tyre.id,
            "size": tyre.size,
            "type": tyre.type_,
            "brand": tyre.brand,
            "pattern": tyre.pattern,
            "category": tyre.category.value,
            "tyre_cost": tyre.tyre_cost,
            "suggested_price": tyre.suggested_price,
            "year": year,
            "month": month,
            "initial_stock": initial_stock,
            "added_stock": added_stock,
            "total_sold": total_sold,
            "total_loss": total_loss,
            "remaining_stock": remaining,
        })

    return inventory_items


async def update_stock(
    db: AsyncSession,
    tyre_id: int,
    year: int,
    month: int,
    initial_stock: int | None = None,
    added_stock: int | None = None,
) -> InventoryPeriod:
    """Update or create inventory stock for a tyre in a period."""
    result = await db.execute(
        select(InventoryPeriod).where(
            InventoryPeriod.tyre_id == tyre_id,
            InventoryPeriod.year == year,
            InventoryPeriod.month == month,
        )
    )
    inv = result.scalar_one_or_none()

    if inv is None:
        inv = InventoryPeriod(
            tyre_id=tyre_id,
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


async def ensure_inventory_exists(
    db: AsyncSession,
    year: int,
    month: int,
) -> bool:
    """Ensure inventory records exist for a given month.

    If none exist, auto-rollover from the most recent month that has records.
    Returns True if records exist or were created, False if no source data found.
    """
    count_result = await db.execute(
        select(func.count(InventoryPeriod.id)).where(
            InventoryPeriod.year == year,
            InventoryPeriod.month == month,
        )
    )
    if count_result.scalar() > 0:
        return True

    # Search backwards up to 12 months for the most recent inventory
    for i in range(1, 13):
        prev_month = month - i
        prev_year = year
        while prev_month <= 0:
            prev_month += 12
            prev_year -= 1

        prev_count_result = await db.execute(
            select(func.count(InventoryPeriod.id)).where(
                InventoryPeriod.year == prev_year,
                InventoryPeriod.month == prev_month,
            )
        )
        if prev_count_result.scalar() > 0:
            count = await rollover_month(db, prev_year, prev_month, year, month)
            logger.info(
                "Auto-rollover: %d/%d -> %d/%d (%d records)",
                prev_year, prev_month, year, month, count,
            )
            return True

    return False


async def get_low_stock(
    db: AsyncSession,
    year: int,
    month: int,
    threshold: int | None = None,
) -> list[dict]:
    """Get tyres with remaining stock below threshold."""
    if threshold is None:
        threshold = settings.LOW_STOCK_THRESHOLD

    all_inventory = await get_inventory(db, year, month)
    return [item for item in all_inventory if item["remaining_stock"] < threshold]


async def rollover_month(
    db: AsyncSession,
    from_year: int,
    from_month: int,
    to_year: int,
    to_month: int,
) -> int:
    """Roll over inventory from one month to the next.

    The remaining stock of the source month becomes the initial stock
    of the target month. Returns the number of records created.
    """
    source_inventory = await get_inventory(db, from_year, from_month)
    count = 0

    for item in source_inventory:
        remaining = item["remaining_stock"]

        # Check if target period already exists
        existing_result = await db.execute(
            select(InventoryPeriod).where(
                InventoryPeriod.tyre_id == item["tyre_id"],
                InventoryPeriod.year == to_year,
                InventoryPeriod.month == to_month,
            )
        )
        existing = existing_result.scalar_one_or_none()

        if existing is not None:
            # Update initial_stock if it changed
            if existing.initial_stock != remaining:
                existing.initial_stock = remaining
                count += 1
            continue

        new_inv = InventoryPeriod(
            tyre_id=item["tyre_id"],
            year=to_year,
            month=to_month,
            initial_stock=remaining,
            added_stock=0,
        )
        db.add(new_inv)
        count += 1

    await db.commit()
    return count
