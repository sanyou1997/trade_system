from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.exchange_rate import ExchangeRate, RateType
from app.models.other_product import OtherProduct
from app.models.other_inventory import OtherInventoryPeriod
from app.models.other_loss import OtherLoss
from app.models.other_sale import OtherSale
from app.models.sale import PaymentMethod
from app.services.other_inventory_service import ensure_other_inventory_exists
from app.utils.currency import format_mwk, mwk_to_cny
from app.utils.date_helpers import get_day_suffix, get_month_name


async def get_daily_summary(db: AsyncSession, target_date: date) -> dict:
    """Get daily summary statistics for other products."""
    year = target_date.year
    month = target_date.month

    today_result = await db.execute(
        select(
            func.coalesce(func.sum(OtherSale.quantity), 0),
            func.coalesce(func.sum(OtherSale.total), 0),
        ).where(OtherSale.sale_date == target_date)
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
        select(func.coalesce(func.sum(OtherSale.quantity), 0)).where(
            func.extract("year", OtherSale.sale_date) == year,
            func.extract("month", OtherSale.sale_date) == month,
            OtherSale.sale_date <= target_date,
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
    """Generate WeChat daily summary message for other products."""
    summary = await get_daily_summary(db, target_date)
    month_name = get_month_name(target_date.month)
    day_str = get_day_suffix(target_date.day)

    breakdown_result = await db.execute(
        select(
            OtherProduct.name,
            func.sum(OtherSale.quantity).label("qty"),
        )
        .join(OtherProduct, OtherSale.other_product_id == OtherProduct.id)
        .where(OtherSale.sale_date == target_date)
        .group_by(OtherProduct.name)
        .order_by(OtherProduct.name)
    )
    breakdown_rows = breakdown_result.all()
    breakdown_str = ", ".join(
        f"{row.name} {int(row.qty)}PCS" for row in breakdown_rows
    )

    sold_today = summary["total_sold_today"]
    detail = f" ({breakdown_str})" if breakdown_str else ""

    message = (
        f"{month_name} {day_str} sold {sold_today}PCS others{detail}, "
        f"(This month sold {summary['total_sold_month']}PCS). "
        f"Total Others Remaining {summary['total_remaining']}, "
        f"Revenue this month cash {format_mwk(summary['revenue_cash_mwk'])}, "
        f"Mukuru {format_mwk(summary['revenue_mukuru_mwk'])}"
    )

    return {"date": target_date.isoformat(), "message": message}


async def get_monthly_stats(db: AsyncSession, year: int, month: int) -> dict:
    """Get monthly other product statistics including profit split."""
    sold_result = await db.execute(
        select(func.coalesce(func.sum(OtherSale.quantity), 0)).where(
            func.extract("year", OtherSale.sale_date) == year,
            func.extract("month", OtherSale.sale_date) == month,
        )
    )
    total_sold = sold_result.scalar()

    revenue_result = await db.execute(
        select(func.coalesce(func.sum(OtherSale.total), 0)).where(
            func.extract("year", OtherSale.sale_date) == year,
            func.extract("month", OtherSale.sale_date) == month,
        )
    )
    revenue_mwk = revenue_result.scalar()

    broken_result = await db.execute(
        select(func.coalesce(func.sum(OtherLoss.quantity), 0)).where(
            func.extract("year", OtherLoss.loss_date) == year,
            func.extract("month", OtherLoss.loss_date) == month,
            OtherLoss.loss_type == "broken",
        )
    )
    total_broken = broken_result.scalar()

    loss_result = await db.execute(
        select(func.coalesce(func.sum(OtherLoss.quantity), 0)).where(
            func.extract("year", OtherLoss.loss_date) == year,
            func.extract("month", OtherLoss.loss_date) == month,
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
    """Get daily other product sales trend for a month."""
    result = await db.execute(
        select(
            func.extract("day", OtherSale.sale_date).label("day"),
            func.sum(OtherSale.quantity).label("quantity"),
            func.sum(OtherSale.total).label("revenue"),
        )
        .where(
            func.extract("year", OtherSale.sale_date) == year,
            func.extract("month", OtherSale.sale_date) == month,
        )
        .group_by(func.extract("day", OtherSale.sale_date))
        .order_by(func.extract("day", OtherSale.sale_date))
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
    """Get total other product revenue for a payment method in a month."""
    conditions = [
        func.extract("year", OtherSale.sale_date) == year,
        func.extract("month", OtherSale.sale_date) == month,
        OtherSale.payment_method == method,
    ]
    if up_to is not None:
        conditions.append(OtherSale.sale_date <= up_to)
    result = await db.execute(
        select(func.coalesce(func.sum(OtherSale.total), 0)).where(*conditions)
    )
    return result.scalar()


async def _total_remaining(
    db: AsyncSession,
    year: int,
    month: int,
    up_to: date | None = None,
) -> int:
    """Calculate total remaining stock across all other products."""
    await ensure_other_inventory_exists(db, year, month)

    inv_result = await db.execute(
        select(
            func.coalesce(func.sum(OtherInventoryPeriod.initial_stock), 0),
            func.coalesce(func.sum(OtherInventoryPeriod.added_stock), 0),
        ).where(
            OtherInventoryPeriod.year == year,
            OtherInventoryPeriod.month == month,
        )
    )
    total_initial, total_added = inv_result.one()

    sold_conditions = [
        func.extract("year", OtherSale.sale_date) == year,
        func.extract("month", OtherSale.sale_date) == month,
    ]
    if up_to is not None:
        sold_conditions.append(OtherSale.sale_date <= up_to)
    sold_result = await db.execute(
        select(func.coalesce(func.sum(OtherSale.quantity), 0)).where(*sold_conditions)
    )
    total_sold = sold_result.scalar()

    loss_conditions = [
        func.extract("year", OtherLoss.loss_date) == year,
        func.extract("month", OtherLoss.loss_date) == month,
    ]
    if up_to is not None:
        loss_conditions.append(OtherLoss.loss_date <= up_to)
    loss_result = await db.execute(
        select(func.coalesce(func.sum(OtherLoss.quantity), 0)).where(*loss_conditions)
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
