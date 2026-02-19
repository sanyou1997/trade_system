from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.phone import Phone
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

        await db.commit()
        await db.refresh(tyre)

        return ApiResponse.ok({
            "id": tyre.id,
            "size": tyre.size,
            "brand": tyre.brand,
            "suggested_price": tyre.suggested_price,
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

    return ApiResponse.fail("Invalid product_type. Must be 'tyre' or 'phone'.")
