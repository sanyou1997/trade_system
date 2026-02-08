import math

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.exchange_rate import ExchangeRate, RateType
from app.models.setting import Setting
from app.models.tyre import Tyre
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingUpdate(BaseModel):
    key: str = Field(..., min_length=1, max_length=100)
    value: str = Field(..., max_length=500)


class CashRateUpdate(BaseModel):
    new_rate: float = Field(..., gt=0)


class ExchangeRateUpdate(BaseModel):
    year: int
    month: int = Field(..., ge=1, le=12)
    rate_type: RateType
    rate: float = Field(..., gt=0)


@router.get("")
async def get_settings(
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    result = await db.execute(select(Setting))
    settings_list = result.scalars().all()
    settings_dict = {s.key: s.value for s in settings_list}
    return ApiResponse.ok(settings_dict)


@router.put("")
async def update_setting(
    body: SettingUpdate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    result = await db.execute(select(Setting).where(Setting.key == body.key))
    setting = result.scalar_one_or_none()

    if setting is None:
        setting = Setting(key=body.key, value=body.value)
        db.add(setting)
    else:
        setting.value = body.value

    await db.commit()
    return ApiResponse.ok({"key": setting.key, "value": setting.value})


@router.get("/exchange-rates")
async def get_exchange_rates(
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[dict]]:
    result = await db.execute(
        select(ExchangeRate).order_by(
            ExchangeRate.year.desc(),
            ExchangeRate.month.desc(),
        )
    )
    rates = result.scalars().all()
    return ApiResponse.ok([
        {
            "id": r.id,
            "year": r.year,
            "month": r.month,
            "rate_type": r.rate_type.value,
            "rate": r.rate,
        }
        for r in rates
    ])


@router.put("/exchange-rates")
async def update_exchange_rate(
    body: ExchangeRateUpdate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    result = await db.execute(
        select(ExchangeRate).where(
            ExchangeRate.year == body.year,
            ExchangeRate.month == body.month,
            ExchangeRate.rate_type == body.rate_type,
        )
    )
    rate = result.scalar_one_or_none()

    if rate is None:
        rate = ExchangeRate(
            year=body.year,
            month=body.month,
            rate_type=body.rate_type,
            rate=body.rate,
        )
        db.add(rate)
    else:
        rate.rate = body.rate

    await db.commit()
    return ApiResponse.ok({
        "id": rate.id,
        "year": rate.year,
        "month": rate.month,
        "rate_type": rate.rate_type.value,
        "rate": rate.rate,
    })


def _round_to_k(value: float) -> int:
    """Round to nearest 1000 (standard rounding, half-up)."""
    return int(math.floor(value / 1000 + 0.5)) * 1000


@router.put("/cash-rate")
async def update_cash_rate(
    body: CashRateUpdate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Update cash rate and recalculate all tyre suggested_price values.

    Formula: new_price = round_to_1000(old_price / old_rate * new_rate)
    """
    # Get current cash rate
    result = await db.execute(
        select(Setting).where(Setting.key == "cash_rate")
    )
    setting = result.scalar_one_or_none()
    old_rate = float(setting.value) if setting else 590.0

    if old_rate <= 0:
        return ApiResponse.fail("Current cash rate is invalid (<=0). Cannot recalculate.")

    new_rate = body.new_rate

    # Recalculate all tyre prices
    result = await db.execute(select(Tyre))
    tyres = result.scalars().all()

    changes = []
    for tyre in tyres:
        old_price = tyre.suggested_price
        if old_price <= 0:
            continue
        new_price = _round_to_k(old_price / old_rate * new_rate)
        if new_price != old_price:
            changes.append({
                "tyre_id": tyre.id,
                "size": tyre.size,
                "brand": tyre.brand,
                "old_price": old_price,
                "new_price": new_price,
            })
            tyre.suggested_price = new_price

    # Update the cash_rate setting
    if setting is None:
        setting = Setting(key="cash_rate", value=str(new_rate))
        db.add(setting)
    else:
        setting.value = str(new_rate)

    await db.commit()

    return ApiResponse.ok({
        "old_rate": old_rate,
        "new_rate": new_rate,
        "tyres_updated": len(changes),
        "changes": changes,
    })
