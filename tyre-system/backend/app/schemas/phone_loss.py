from datetime import date

from pydantic import BaseModel, Field

from app.models.loss import LossType


class PhoneLossCreate(BaseModel):
    loss_date: date
    phone_id: int
    quantity: int = Field(..., gt=0)
    loss_type: LossType
    refund_amount: float = Field(0.0, ge=0)
    notes: str | None = Field(None, max_length=500)


class PhoneLossResponse(BaseModel):
    id: int
    loss_date: date
    phone_id: int
    quantity: int
    loss_type: LossType
    refund_amount: float
    notes: str | None

    # Joined fields
    phone_brand: str | None = None
    phone_model: str | None = None

    model_config = {"from_attributes": True}
