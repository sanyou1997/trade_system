from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.common import ApiResponse
from app.services import phone_inventory_service
from app.services.phone_inventory_service import ensure_phone_inventory_exists

router = APIRouter(prefix="/phone-inventory", tags=["phone-inventory"])


class PhoneStockUpdate(BaseModel):
    phone_id: int
    year: int
    month: int = Field(..., ge=1, le=12)
    initial_stock: int | None = Field(None, ge=0)
    added_stock: int | None = Field(None, ge=0)


class PhoneRolloverRequest(BaseModel):
    from_year: int
    from_month: int = Field(..., ge=1, le=12)
    to_year: int
    to_month: int = Field(..., ge=1, le=12)


@router.get("/{year}/{month}")
async def get_phone_inventory(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[dict]]:
    if not 1 <= month <= 12:
        return ApiResponse.fail("Month must be between 1 and 12")
    await ensure_phone_inventory_exists(db, year, month)
    items = await phone_inventory_service.get_phone_inventory(db, year, month)
    return ApiResponse.ok(items)


@router.put("/stock")
async def update_phone_stock(
    body: PhoneStockUpdate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    inv = await phone_inventory_service.update_phone_stock(
        db,
        phone_id=body.phone_id,
        year=body.year,
        month=body.month,
        initial_stock=body.initial_stock,
        added_stock=body.added_stock,
    )
    return ApiResponse.ok({
        "id": inv.id,
        "phone_id": inv.phone_id,
        "year": inv.year,
        "month": inv.month,
        "initial_stock": inv.initial_stock,
        "added_stock": inv.added_stock,
    })


@router.get("/low-stock")
async def get_phone_low_stock(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    threshold: int | None = Query(None, ge=0),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[dict]]:
    await ensure_phone_inventory_exists(db, year, month)
    items = await phone_inventory_service.get_phone_low_stock(
        db, year, month, threshold
    )
    return ApiResponse.ok(items)


@router.post("/rollover")
async def rollover_phone_month(
    body: PhoneRolloverRequest,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    count = await phone_inventory_service.rollover_phone_month(
        db,
        from_year=body.from_year,
        from_month=body.from_month,
        to_year=body.to_year,
        to_month=body.to_month,
    )
    return ApiResponse.ok({"records_created": count})
