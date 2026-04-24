import math

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.other_product import OtherProduct
from app.models.phone import Phone
from app.models.setting import Setting
from app.models.tyre import Tyre
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/prices", tags=["prices"])

PRICE_EDIT_PASSWORD = "f62553359"


class PriceUpdateRequest(BaseModel):
    product_type: str  # "tyre" or "phone"
    product_id: int
    password: str
    suggested_price: float | None = Field(None, ge=0)
    cash_price: float | None = Field(None, ge=0)
    mukuru_price: float | None = Field(None, ge=0)
    online_price: float | None = Field(None, ge=0)


class BulkPriceAdjustRequest(BaseModel):
    product_type: str
    password: str
    percentage: float = Field(..., gt=-100)


def _round_to_k(value: float) -> int:
    return int(math.floor(value / 1000 + 0.5)) * 1000


async def _get_setting_float(
    db: AsyncSession,
    key: str,
    default: float,
) -> float:
    result = await db.execute(select(Setting).where(Setting.key == key))
    setting = result.scalar_one_or_none()
    if setting is None:
        return default
    try:
        return float(setting.value)
    except (TypeError, ValueError):
        return default


async def _calculate_tyre_mukuru_price(
    db: AsyncSession,
    suggested_price: float,
) -> int:
    cash_rate = await _get_setting_float(db, "cash_rate", 590.0)
    mukuru_rate = await _get_setting_float(db, "mukuru_rate", cash_rate)
    if cash_rate <= 0 or mukuru_rate <= 0:
        return 0
    return _round_to_k(suggested_price * mukuru_rate / cash_rate)


@router.put("/update")
async def update_price(
    body: PriceUpdateRequest,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Update product price(s) with password verification."""
    if body.password != PRICE_EDIT_PASSWORD:
        return ApiResponse.fail("Invalid password")

    if body.product_type == "tyre":
        result = await db.execute(select(Tyre).where(Tyre.id == body.product_id))
        tyre = result.scalar_one_or_none()
        if tyre is None:
            return ApiResponse.fail("Tyre not found")

        if body.suggested_price is not None:
            tyre.suggested_price = body.suggested_price
        elif body.mukuru_price is not None:
            cash_rate = await _get_setting_float(db, "cash_rate", 590.0)
            mukuru_rate = await _get_setting_float(db, "mukuru_rate", cash_rate)
            if cash_rate <= 0 or mukuru_rate <= 0:
                return ApiResponse.fail("Exchange rates are invalid")
            tyre.suggested_price = _round_to_k(
                body.mukuru_price * cash_rate / mukuru_rate
            )

        await db.commit()
        await db.refresh(tyre)

        return ApiResponse.ok({
            "id": tyre.id,
            "size": tyre.size,
            "brand": tyre.brand,
            "suggested_price": tyre.suggested_price,
            "mukuru_price": await _calculate_tyre_mukuru_price(
                db, tyre.suggested_price
            ),
        })

    if body.product_type == "phone":
        result = await db.execute(select(Phone).where(Phone.id == body.product_id))
        phone = result.scalar_one_or_none()
        if phone is None:
            return ApiResponse.fail("Phone not found")

        if body.cash_price is not None:
            phone.cash_price = body.cash_price
        if body.mukuru_price is not None:
            phone.mukuru_price = body.mukuru_price
        if body.online_price is not None:
            phone.online_price = body.online_price

        await db.commit()
        await db.refresh(phone)

        return ApiResponse.ok({
            "id": phone.id,
            "brand": phone.brand,
            "model": phone.model,
            "cash_price": phone.cash_price,
            "mukuru_price": phone.mukuru_price,
            "online_price": phone.online_price,
        })

    if body.product_type == "other":
        result = await db.execute(
            select(OtherProduct).where(OtherProduct.id == body.product_id)
        )
        product = result.scalar_one_or_none()
        if product is None:
            return ApiResponse.fail("Other product not found")

        if body.suggested_price is not None:
            product.suggested_price = body.suggested_price

        await db.commit()
        await db.refresh(product)

        return ApiResponse.ok({
            "id": product.id,
            "name": product.name,
            "suggested_price": product.suggested_price,
        })

    return ApiResponse.fail("Invalid product_type. Must be 'tyre', 'phone', or 'other'.")


@router.put("/bulk-adjust")
async def bulk_adjust_prices(
    body: BulkPriceAdjustRequest,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Adjust all prices for a product group by a percentage and round to 1000."""
    if body.password != PRICE_EDIT_PASSWORD:
        return ApiResponse.fail("Invalid password")

    factor = 1 + body.percentage / 100
    changes: list[dict] = []

    if body.product_type == "tyre":
        result = await db.execute(select(Tyre).order_by(Tyre.id))
        for tyre in result.scalars().all():
            old_price = tyre.suggested_price
            new_price = _round_to_k(old_price * factor)
            if new_price != old_price:
                tyre.suggested_price = new_price
                changes.append({
                    "id": tyre.id,
                    "label": f"{tyre.size} {tyre.brand or ''}".strip(),
                    "field": "suggested_price",
                    "old_price": old_price,
                    "new_price": new_price,
                })
    elif body.product_type == "phone":
        result = await db.execute(select(Phone).order_by(Phone.id))
        for phone in result.scalars().all():
            for field in ("cash_price", "mukuru_price", "online_price"):
                old_price = getattr(phone, field)
                new_price = _round_to_k(old_price * factor)
                if new_price != old_price:
                    setattr(phone, field, new_price)
                    changes.append({
                        "id": phone.id,
                        "label": f"{phone.brand} {phone.model}".strip(),
                        "field": field,
                        "old_price": old_price,
                        "new_price": new_price,
                    })
    elif body.product_type == "other":
        result = await db.execute(select(OtherProduct).order_by(OtherProduct.id))
        for product in result.scalars().all():
            old_price = product.suggested_price
            new_price = _round_to_k(old_price * factor)
            if new_price != old_price:
                product.suggested_price = new_price
                changes.append({
                    "id": product.id,
                    "label": product.name,
                    "field": "suggested_price",
                    "old_price": old_price,
                    "new_price": new_price,
                })
    else:
        return ApiResponse.fail("Invalid product_type. Must be 'tyre', 'phone', or 'other'.")

    await db.commit()
    return ApiResponse.ok({
        "product_type": body.product_type,
        "percentage": body.percentage,
        "updated_count": len(changes),
        "changes": changes,
    })
