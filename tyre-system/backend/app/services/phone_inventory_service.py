import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.phone import Phone
from app.models.phone_inventory import PhoneInventoryPeriod
from app.models.phone_loss import PhoneLoss
from app.models.phone_sale import PhoneSale

logger = logging.getLogger(__name__)


async def get_phone_inventory(
    db: AsyncSession,
    year: int,
    month: int,
) -> list[dict]:
    """Get inventory for all phones in a given period with remaining stock."""
    phones_result = await db.execute(select(Phone).order_by(Phone.id))
    phones = list(phones_result.scalars().all())

    inventory_items = []
    for phone in phones:
        inv_result = await db.execute(
            select(PhoneInventoryPeriod).where(
                PhoneInventoryPeriod.phone_id == phone.id,
                PhoneInventoryPeriod.year == year,
                PhoneInventoryPeriod.month == month,
            )
        )
        inv = inv_result.scalar_one_or_none()

        initial_stock = inv.initial_stock if inv else 0
        added_stock = inv.added_stock if inv else 0

        sold_result = await db.execute(
            select(func.coalesce(func.sum(PhoneSale.quantity), 0)).where(
                PhoneSale.phone_id == phone.id,
                func.extract("year", PhoneSale.sale_date) == year,
                func.extract("month", PhoneSale.sale_date) == month,
            )
        )
        total_sold = sold_result.scalar()

        loss_result = await db.execute(
            select(func.coalesce(func.sum(PhoneLoss.quantity), 0)).where(
                PhoneLoss.phone_id == phone.id,
                func.extract("year", PhoneLoss.loss_date) == year,
                func.extract("month", PhoneLoss.loss_date) == month,
            )
        )
        total_loss = loss_result.scalar()

        remaining = initial_stock + added_stock - total_sold - total_loss

        inventory_items.append({
            "phone_id": phone.id,
            "brand": phone.brand,
            "model": phone.model,
            "config": phone.config,
            "note": phone.note,
            "cost": phone.cost,
            "cash_price": phone.cash_price,
            "mukuru_price": phone.mukuru_price,
            "online_price": phone.online_price,
            "status": phone.status,
            "year": year,
            "month": month,
            "initial_stock": initial_stock,
            "added_stock": added_stock,
            "total_sold": total_sold,
            "total_loss": total_loss,
            "remaining_stock": remaining,
        })

    return inventory_items


async def update_phone_stock(
    db: AsyncSession,
    phone_id: int,
    year: int,
    month: int,
    initial_stock: int | None = None,
    added_stock: int | None = None,
) -> PhoneInventoryPeriod:
    """Update or create inventory stock for a phone in a period."""
    result = await db.execute(
        select(PhoneInventoryPeriod).where(
            PhoneInventoryPeriod.phone_id == phone_id,
            PhoneInventoryPeriod.year == year,
            PhoneInventoryPeriod.month == month,
        )
    )
    inv = result.scalar_one_or_none()

    if inv is None:
        inv = PhoneInventoryPeriod(
            phone_id=phone_id,
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


async def ensure_phone_inventory_exists(
    db: AsyncSession,
    year: int,
    month: int,
) -> bool:
    """Ensure phone inventory records exist for a given month.

    If none exist, auto-rollover from the most recent month that has records.
    """
    count_result = await db.execute(
        select(func.count(PhoneInventoryPeriod.id)).where(
            PhoneInventoryPeriod.year == year,
            PhoneInventoryPeriod.month == month,
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
            select(func.count(PhoneInventoryPeriod.id)).where(
                PhoneInventoryPeriod.year == prev_year,
                PhoneInventoryPeriod.month == prev_month,
            )
        )
        if prev_count_result.scalar() > 0:
            count = await rollover_phone_month(
                db, prev_year, prev_month, year, month
            )
            logger.info(
                "Phone auto-rollover: %d/%d -> %d/%d (%d records)",
                prev_year, prev_month, year, month, count,
            )
            return True

    return False


async def get_phone_low_stock(
    db: AsyncSession,
    year: int,
    month: int,
    threshold: int | None = None,
) -> list[dict]:
    """Get phones with remaining stock below threshold."""
    if threshold is None:
        threshold = settings.LOW_STOCK_THRESHOLD

    all_inventory = await get_phone_inventory(db, year, month)
    return [item for item in all_inventory if item["remaining_stock"] < threshold]


async def rollover_phone_month(
    db: AsyncSession,
    from_year: int,
    from_month: int,
    to_year: int,
    to_month: int,
) -> int:
    """Roll over phone inventory from one month to the next."""
    source_inventory = await get_phone_inventory(db, from_year, from_month)
    count = 0

    for item in source_inventory:
        remaining = item["remaining_stock"]

        existing_result = await db.execute(
            select(PhoneInventoryPeriod).where(
                PhoneInventoryPeriod.phone_id == item["phone_id"],
                PhoneInventoryPeriod.year == to_year,
                PhoneInventoryPeriod.month == to_month,
            )
        )
        existing = existing_result.scalar_one_or_none()

        if existing is not None:
            if existing.initial_stock != remaining:
                existing.initial_stock = remaining
                count += 1
            continue

        new_inv = PhoneInventoryPeriod(
            phone_id=item["phone_id"],
            year=to_year,
            month=to_month,
            initial_stock=remaining,
            added_stock=0,
        )
        db.add(new_inv)
        count += 1

    await db.commit()
    return count
