import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.models.other_product import OtherProduct
from app.models.other_loss import OtherLoss
from app.schemas.common import ApiResponse
from app.schemas.other_loss import OtherLossCreate, OtherLossResponse

router = APIRouter(prefix="/other-losses", tags=["other-losses"])


def _loss_to_response(loss: OtherLoss) -> OtherLossResponse:
    """Convert OtherLoss ORM to OtherLossResponse with joined product name."""
    product = loss.other_product
    return OtherLossResponse(
        id=loss.id,
        loss_date=loss.loss_date,
        other_product_id=loss.other_product_id,
        quantity=loss.quantity,
        loss_type=loss.loss_type,
        refund_amount=loss.refund_amount,
        notes=loss.notes,
        product_name=product.name if product else None,
    )


@router.get("")
async def list_other_losses(
    year: int = Query(default=None),
    month: int = Query(default=None, ge=1, le=12),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[OtherLossResponse]]:
    stmt = select(OtherLoss).options(joinedload(OtherLoss.other_product))

    if year and month:
        month_start = datetime.date(year, month, 1)
        month_end = datetime.date(
            year + (1 if month == 12 else 0),
            (month % 12) + 1,
            1,
        )
        stmt = stmt.where(
            OtherLoss.loss_date >= month_start,
            OtherLoss.loss_date < month_end,
        )

    stmt = stmt.order_by(OtherLoss.loss_date.desc(), OtherLoss.id.desc())
    result = await db.execute(stmt)
    losses = result.scalars().unique().all()
    return ApiResponse.ok([_loss_to_response(l) for l in losses])


@router.post("")
async def create_other_loss(
    body: OtherLossCreate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[OtherLossResponse]:
    product_result = await db.execute(
        select(OtherProduct).where(OtherProduct.id == body.other_product_id)
    )
    product = product_result.scalar_one_or_none()
    if product is None:
        return ApiResponse.fail(
            f"Other product with id {body.other_product_id} not found"
        )

    loss = OtherLoss(
        loss_date=body.loss_date,
        other_product_id=body.other_product_id,
        quantity=body.quantity,
        loss_type=body.loss_type,
        refund_amount=body.refund_amount,
        notes=body.notes,
    )
    db.add(loss)
    await db.commit()
    await db.refresh(loss, ["other_product"])
    return ApiResponse.ok(_loss_to_response(loss))


@router.delete("/{loss_id}")
async def delete_other_loss(
    loss_id: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    result = await db.execute(select(OtherLoss).where(OtherLoss.id == loss_id))
    loss = result.scalar_one_or_none()
    if loss is None:
        return ApiResponse.fail(f"Other loss with id {loss_id} not found")
    await db.delete(loss)
    await db.commit()
    return ApiResponse.ok(None)
