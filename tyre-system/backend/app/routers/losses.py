import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.models.loss import Loss
from app.models.tyre import Tyre
from app.schemas.common import ApiResponse
from app.schemas.loss import LossCreate, LossResponse

router = APIRouter(prefix="/losses", tags=["losses"])


def _loss_to_response(loss: Loss) -> LossResponse:
    """Convert Loss ORM to LossResponse with joined tyre fields."""
    tyre = loss.tyre
    return LossResponse(
        id=loss.id,
        loss_date=loss.loss_date,
        tyre_id=loss.tyre_id,
        quantity=loss.quantity,
        loss_type=loss.loss_type,
        refund_amount=loss.refund_amount,
        notes=loss.notes,
        tyre_size=tyre.size if tyre else None,
        tyre_brand=tyre.brand if tyre else None,
    )


@router.get("")
async def list_losses(
    year: int = Query(default=None),
    month: int = Query(default=None, ge=1, le=12),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[LossResponse]]:
    stmt = select(Loss).options(joinedload(Loss.tyre))

    if year and month:
        month_start = datetime.date(year, month, 1)
        month_end = datetime.date(
            year + (1 if month == 12 else 0),
            (month % 12) + 1, 1,
        )
        stmt = stmt.where(
            Loss.loss_date >= month_start,
            Loss.loss_date < month_end,
        )

    stmt = stmt.order_by(Loss.loss_date.desc(), Loss.id.desc())
    result = await db.execute(stmt)
    losses = result.scalars().unique().all()
    return ApiResponse.ok([_loss_to_response(l) for l in losses])


@router.get("/{loss_id}")
async def get_loss(
    loss_id: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[LossResponse]:
    result = await db.execute(
        select(Loss).options(joinedload(Loss.tyre)).where(Loss.id == loss_id)
    )
    loss = result.scalars().unique().one_or_none()
    if loss is None:
        return ApiResponse.fail(f"Loss with id {loss_id} not found")
    return ApiResponse.ok(_loss_to_response(loss))


@router.post("")
async def create_loss(
    body: LossCreate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[LossResponse]:
    # Validate tyre exists
    tyre_result = await db.execute(select(Tyre).where(Tyre.id == body.tyre_id))
    tyre = tyre_result.scalar_one_or_none()
    if tyre is None:
        return ApiResponse.fail(f"Tyre with id {body.tyre_id} not found")

    loss = Loss(
        loss_date=body.loss_date,
        tyre_id=body.tyre_id,
        quantity=body.quantity,
        loss_type=body.loss_type,
        refund_amount=body.refund_amount,
        notes=body.notes,
    )
    db.add(loss)
    await db.commit()
    await db.refresh(loss, ["tyre"])
    return ApiResponse.ok(_loss_to_response(loss))


@router.delete("/{loss_id}")
async def delete_loss(
    loss_id: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    result = await db.execute(select(Loss).where(Loss.id == loss_id))
    loss = result.scalar_one_or_none()
    if loss is None:
        return ApiResponse.fail(f"Loss with id {loss_id} not found")
    await db.delete(loss)
    await db.commit()
    return ApiResponse.ok(None)
