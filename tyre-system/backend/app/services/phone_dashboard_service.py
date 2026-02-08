from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.exchange_rate import ExchangeRate, RateType
from app.models.phone import Phone
from app.models.phone_inventory import PhoneInventoryPeriod
from app.models.phone_loss import PhoneLoss
from app.models.phone_sale import PhoneSale
from app.models.sale import PaymentMethod
from app.services.phone_inventory_service import ensure_phone_inventory_exists
from app.utils.currency import format_mwk, mwk_to_cny
from app.utils.date_helpers import get_day_suffix, get_month_name


async def get_daily_summary(db: AsyncSession, target_date: date) -> dict:
    """Get daily summary statistics for phones."""
    year = target_date.year
    month = target_date.month

    today_result = await db.execute(
        select(
            func.coalesce(func.sum(PhoneSale.quantity), 0),
            func.coalesce(func.sum(PhoneSale.total), 0),
        ).where(PhoneSale.sale_date == target_date)
    )
    today_qty, _ = today_result.one()

    month_cash = await _revenue_by_method(
        db, year, month, PaymentMethod.CASH, target_date
    )
    month_mukuru = await _revenue_by_method(
        db, year, month, PaymentMethod.MUKURU, target_date
    )
    month_card = await _revenue_by_method(
        db, year, month, PaymentMethod.CARD, target_date
    )

    month_sold_result = await db.execute(
        select(func.coalesce(func.sum(PhoneSale.quantity), 0)).where(
            func.extract("year", PhoneSale.sale_date) == year,
            func.extract("month", PhoneSale.sale_date) == month,
            PhoneSale.sale_date <= target_date,
        )
    )
    month_sold = month_sold_result.scalar()

    remaining = await _total_remaining(db, year, month, target_date)

    return {
        "date": target_date.isoformat(),
        "total_sold_today": today_qty,
        "total_sold_month": month_sold,
        "total_remaining": remaining,
        "revenue_cash_mwk": month_cash,
        "revenue_mukuru_mwk": month_mukuru,
        "revenue_card_mwk": month_card,
        "total_revenue_mwk": month_cash + month_mukuru + month_card,
    }


async def generate_wechat_message(db: AsyncSession, target_date: date) -> dict:
    """Generate WeChat daily summary message for phones."""
    summary = await get_daily_summary(db, target_date)
    month_name = get_month_name(target_date.month)
    day_str = get_day_suffix(target_date.day)

    breakdown_result = await db.execute(
        select(
            Phone.brand,
            Phone.model,
            func.sum(PhoneSale.quantity).label("qty"),
        )
        .join(Phone, PhoneSale.phone_id == Phone.id)
        .where(PhoneSale.sale_date == target_date)
        .group_by(Phone.brand, Phone.model)
        .order_by(Phone.brand, Phone.model)
    )
    breakdown_rows = breakdown_result.all()
    breakdown_str = ", ".join(
        f"{row.brand} {row.model} {int(row.qty)}PCS" for row in breakdown_rows
    )

    sold_today = summary["total_sold_today"]
    detail = f" ({breakdown_str})" if breakdown_str else ""

    message = (
        f"{month_name} {day_str} sold {sold_today}PCS phones{detail}, "
        f"(This month sold {summary['total_sold_month']}PCS). "
        f"Total Phones Remaining {summary['total_remaining']}, "
        f"Revenue this month cash {format_mwk(summary['revenue_cash_mwk'])}, "
        f"Mukuru {format_mwk(summary['revenue_mukuru_mwk'])}"
    )

    return {"date": target_date.isoformat(), "message": message}


async def get_monthly_stats(db: AsyncSession, year: int, month: int) -> dict:
    """Get monthly phone statistics including profit split."""
    sold_result = await db.execute(
        select(func.coalesce(func.sum(PhoneSale.quantity), 0)).where(
            func.extract("year", PhoneSale.sale_date) == year,
            func.extract("month", PhoneSale.sale_date) == month,
        )
    )
    total_sold = sold_result.scalar()

    revenue_result = await db.execute(
        select(func.coalesce(func.sum(PhoneSale.total), 0)).where(
            func.extract("year", PhoneSale.sale_date) == year,
            func.extract("month", PhoneSale.sale_date) == month,
        )
    )
    revenue_mwk = revenue_result.scalar()

    broken_result = await db.execute(
        select(func.coalesce(func.sum(PhoneLoss.quantity), 0)).where(
            func.extract("year", PhoneLoss.loss_date) == year,
            func.extract("month", PhoneLoss.loss_date) == month,
            PhoneLoss.loss_type == "broken",
        )
    )
    total_broken = broken_result.scalar()

    loss_result = await db.execute(
        select(func.coalesce(func.sum(PhoneLoss.quantity), 0)).where(
            func.extract("year", PhoneLoss.loss_date) == year,
            func.extract("month", PhoneLoss.loss_date) == month,
        )
    )
    total_loss = loss_result.scalar()

    remaining = await _total_remaining(db, year, month)

    cash_rate = await _get_rate(db, year, month, RateType.CASH)
    mukuru_rate = await _get_rate(db, year, month, RateType.MUKURU)
    avg_rate = (
        (cash_rate + mukuru_rate) / 2
        if (cash_rate and mukuru_rate)
        else (cash_rate or mukuru_rate or settings.DEFAULT_EXCHANGE_RATE)
    )

    revenue_cny = mwk_to_cny(revenue_mwk, avg_rate)
    partner_share = round(revenue_cny * settings.PARTNER_SPLIT_PERCENT / 100, 2)
    sanyou_share = round(revenue_cny * settings.SANYOU_SPLIT_PERCENT / 100, 2)

    return {
        "year": year,
        "month": month,
        "total_sold": total_sold,
        "total_broken": total_broken,
        "total_loss": total_loss,
        "total_remaining": remaining,
        "revenue_mwk": revenue_mwk,
        "revenue_cny": revenue_cny,
        "partner_share_cny": partner_share,
        "sanyou_share_cny": sanyou_share,
        "cash_rate": cash_rate,
        "mukuru_rate": mukuru_rate,
    }


async def get_sales_trend(db: AsyncSession, year: int, month: int) -> dict:
    """Get daily phone sales trend for a month."""
    result = await db.execute(
        select(
            func.extract("day", PhoneSale.sale_date).label("day"),
            func.sum(PhoneSale.quantity).label("quantity"),
            func.sum(PhoneSale.total).label("revenue"),
        )
        .where(
            func.extract("year", PhoneSale.sale_date) == year,
            func.extract("month", PhoneSale.sale_date) == month,
        )
        .group_by(func.extract("day", PhoneSale.sale_date))
        .order_by(func.extract("day", PhoneSale.sale_date))
    )
    rows = result.all()

    daily_data = [
        {
            "day": int(row.day),
            "quantity": int(row.quantity),
            "revenue": float(row.revenue),
        }
        for row in rows
    ]
    total_qty = sum(d["quantity"] for d in daily_data)
    total_rev = sum(d["revenue"] for d in daily_data)

    return {
        "year": year,
        "month": month,
        "daily_data": daily_data,
        "total_quantity": total_qty,
        "total_revenue": total_rev,
    }


async def _revenue_by_method(
    db: AsyncSession,
    year: int,
    month: int,
    method: PaymentMethod,
    up_to: date | None = None,
) -> float:
    """Get total phone revenue for a payment method in a month."""
    conditions = [
        func.extract("year", PhoneSale.sale_date) == year,
        func.extract("month", PhoneSale.sale_date) == month,
        PhoneSale.payment_method == method,
    ]
    if up_to is not None:
        conditions.append(PhoneSale.sale_date <= up_to)
    result = await db.execute(
        select(func.coalesce(func.sum(PhoneSale.total), 0)).where(*conditions)
    )
    return result.scalar()


async def _total_remaining(
    db: AsyncSession,
    year: int,
    month: int,
    up_to: date | None = None,
) -> int:
    """Calculate total remaining stock across all phones."""
    await ensure_phone_inventory_exists(db, year, month)

    inv_result = await db.execute(
        select(
            func.coalesce(func.sum(PhoneInventoryPeriod.initial_stock), 0),
            func.coalesce(func.sum(PhoneInventoryPeriod.added_stock), 0),
        ).where(
            PhoneInventoryPeriod.year == year,
            PhoneInventoryPeriod.month == month,
        )
    )
    total_initial, total_added = inv_result.one()

    sold_conditions = [
        func.extract("year", PhoneSale.sale_date) == year,
        func.extract("month", PhoneSale.sale_date) == month,
    ]
    if up_to is not None:
        sold_conditions.append(PhoneSale.sale_date <= up_to)
    sold_result = await db.execute(
        select(func.coalesce(func.sum(PhoneSale.quantity), 0)).where(*sold_conditions)
    )
    total_sold = sold_result.scalar()

    loss_conditions = [
        func.extract("year", PhoneLoss.loss_date) == year,
        func.extract("month", PhoneLoss.loss_date) == month,
    ]
    if up_to is not None:
        loss_conditions.append(PhoneLoss.loss_date <= up_to)
    loss_result = await db.execute(
        select(func.coalesce(func.sum(PhoneLoss.quantity), 0)).where(*loss_conditions)
    )
    total_loss = loss_result.scalar()

    return total_initial + total_added - total_sold - total_loss


async def _get_rate(
    db: AsyncSession,
    year: int,
    month: int,
    rate_type: RateType,
) -> float:
    """Get exchange rate, falling back to default."""
    result = await db.execute(
        select(ExchangeRate.rate).where(
            ExchangeRate.year == year,
            ExchangeRate.month == month,
            ExchangeRate.rate_type == rate_type,
        )
    )
    rate = result.scalar_one_or_none()
    return rate if rate is not None else settings.DEFAULT_EXCHANGE_RATE
