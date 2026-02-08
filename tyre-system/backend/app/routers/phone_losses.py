import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.models.phone import Phone
from app.models.phone_loss import PhoneLoss
from app.schemas.common import ApiResponse
from app.schemas.phone_loss import PhoneLossCreate, PhoneLossResponse

router = APIRouter(prefix="/phone-losses", tags=["phone-losses"])


def _loss_to_response(loss: PhoneLoss) -> PhoneLossResponse:
    """Convert PhoneLoss ORM to PhoneLossResponse with joined phone fields."""
    phone = loss.phone
    return PhoneLossResponse(
        id=loss.id,
        loss_date=loss.loss_date,
        phone_id=loss.phone_id,
        quantity=loss.quantity,
        loss_type=loss.loss_type,
        refund_amount=loss.refund_amount,
        notes=loss.notes,
        phone_brand=phone.brand if phone else None,
        phone_model=phone.model if phone else None,
    )


@router.get("")
async def list_phone_losses(
    year: int = Query(default=None),
    month: int = Query(default=None, ge=1, le=12),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[PhoneLossResponse]]:
    stmt = select(PhoneLoss).options(joinedload(PhoneLoss.phone))

    if year and month:
        month_start = datetime.date(year, month, 1)
        month_end = datetime.date(
            year + (1 if month == 12 else 0),
            (month % 12) + 1,
            1,
        )
        stmt = stmt.where(
            PhoneLoss.loss_date >= month_start,
            PhoneLoss.loss_date < month_end,
        )

    stmt = stmt.order_by(PhoneLoss.loss_date.desc(), PhoneLoss.id.desc())
    result = await db.execute(stmt)
    losses = result.scalars().unique().all()
    return ApiResponse.ok([_loss_to_response(l) for l in losses])


@router.post("")
async def create_phone_loss(
    body: PhoneLossCreate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[PhoneLossResponse]:
    phone_result = await db.execute(select(Phone).where(Phone.id == body.phone_id))
    phone = phone_result.scalar_one_or_none()
    if phone is None:
        return ApiResponse.fail(f"Phone with id {body.phone_id} not found")

    loss = PhoneLoss(
        loss_date=body.loss_date,
        phone_id=body.phone_id,
        quantity=body.quantity,
        loss_type=body.loss_type,
        refund_amount=body.refund_amount,
        notes=body.notes,
    )
    db.add(loss)
    await db.commit()
    await db.refresh(loss, ["phone"])
    return ApiResponse.ok(_loss_to_response(loss))


@router.delete("/{loss_id}")
async def delete_phone_loss(
    loss_id: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    result = await db.execute(select(PhoneLoss).where(PhoneLoss.id == loss_id))
    loss = result.scalar_one_or_none()
    if loss is None:
        return ApiResponse.fail(f"Phone loss with id {loss_id} not found")
    await db.delete(loss)
    await db.commit()
    return ApiResponse.ok(None)
