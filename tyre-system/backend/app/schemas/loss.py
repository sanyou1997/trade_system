from datetime import date

from pydantic import BaseModel, Field

from app.models.loss import LossType


class LossCreate(BaseModel):
    loss_date: date
    tyre_id: int
    quantity: int = Field(..., gt=0)
    loss_type: LossType
    refund_amount: float = Field(0.0, ge=0)
    notes: str | None = Field(None, max_length=500)


class LossResponse(BaseModel):
    id: int
    loss_date: date
    tyre_id: int
    quantity: int
    loss_type: LossType
    refund_amount: float
    notes: str | None

    # Joined fields
    tyre_size: str | None = None
    tyre_brand: str | None = None

    model_config = {"from_attributes": True}
