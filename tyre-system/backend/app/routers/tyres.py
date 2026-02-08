import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.inventory import InventoryPeriod
from app.models.sale import Sale
from app.models.tyre import Tyre
from app.schemas.common import ApiResponse
from app.schemas.tyre import TyreCreate, TyreResponse, TyreUpdate, TyreWithStock

router = APIRouter(prefix="/tyres", tags=["tyres"])


@router.get("")
async def list_tyres(
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[TyreResponse]]:
    result = await db.execute(select(Tyre).order_by(Tyre.id))
    tyres = result.scalars().all()
    return ApiResponse.ok(
        [TyreResponse.model_validate(t) for t in tyres]
    )


@router.get("/with-stock")
async def list_tyres_with_stock(
    year: int = Query(default=None),
    month: int = Query(default=None, ge=1, le=12),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[TyreWithStock]]:
    now = datetime.date.today()
    year = year or now.year
    month = month or now.month
    result = await db.execute(select(Tyre).order_by(Tyre.id))
    tyres = result.scalars().all()

    items = []
    for tyre in tyres:
        inv_result = await db.execute(
            select(InventoryPeriod).where(
                InventoryPeriod.tyre_id == tyre.id,
                InventoryPeriod.year == year,
                InventoryPeriod.month == month,
            )
        )
        inv = inv_result.scalar_one_or_none()
        initial = inv.initial_stock if inv else 0
        added = inv.added_stock if inv else 0

        sold_result = await db.execute(
            select(func.coalesce(func.sum(Sale.quantity), 0)).where(
                Sale.tyre_id == tyre.id,
                func.extract("year", Sale.sale_date) == year,
                func.extract("month", Sale.sale_date) == month,
            )
        )
        total_sold = sold_result.scalar()
        remaining = initial + added - total_sold

        tyre_data = TyreResponse.model_validate(tyre)
        items.append(TyreWithStock(
            **tyre_data.model_dump(by_alias=True),
            initial_stock=initial,
            added_stock=added,
            total_sold=total_sold,
            remaining_stock=remaining,
        ))

    return ApiResponse.ok(items)


@router.get("/{tyre_id}")
async def get_tyre(
    tyre_id: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TyreResponse]:
    result = await db.execute(select(Tyre).where(Tyre.id == tyre_id))
    tyre = result.scalar_one_or_none()
    if tyre is None:
        return ApiResponse.fail(f"Tyre with id {tyre_id} not found")
    return ApiResponse.ok(TyreResponse.model_validate(tyre))


@router.post("")
async def create_tyre(
    body: TyreCreate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TyreResponse]:
    tyre = Tyre(
        size=body.size,
        type_=body.type_,
        brand=body.brand,
        pattern=body.pattern,
        li_sr=body.li_sr,
        tyre_cost=body.tyre_cost,
        suggested_price=body.suggested_price,
        category=body.category,
        excel_row=body.excel_row,
    )
    db.add(tyre)
    await db.commit()
    return ApiResponse.ok(TyreResponse.model_validate(tyre))


@router.put("/{tyre_id}")
async def update_tyre(
    tyre_id: int,
    body: TyreUpdate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TyreResponse]:
    result = await db.execute(select(Tyre).where(Tyre.id == tyre_id))
    tyre = result.scalar_one_or_none()
    if tyre is None:
        return ApiResponse.fail(f"Tyre with id {tyre_id} not found")

    update_data = body.model_dump(exclude_unset=True, by_alias=False)
    for field, value in update_data.items():
        setattr(tyre, field, value)

    await db.commit()
    return ApiResponse.ok(TyreResponse.model_validate(tyre))


@router.delete("/{tyre_id}")
async def delete_tyre(
    tyre_id: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    result = await db.execute(select(Tyre).where(Tyre.id == tyre_id))
    tyre = result.scalar_one_or_none()
    if tyre is None:
        return ApiResponse.fail(f"Tyre with id {tyre_id} not found")
    await db.delete(tyre)
    await db.commit()
    return ApiResponse.ok(None)
