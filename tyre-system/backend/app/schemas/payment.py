from datetime import date

from pydantic import BaseModel, Field


class PaymentCreate(BaseModel):
    payment_date: date
    customer: str = Field(..., min_length=1, max_length=200)
    payment_method: str = Field(..., min_length=1, max_length=50)
    amount_mwk: float = Field(..., gt=0)


class PaymentResponse(BaseModel):
    id: int
    payment_date: date
    customer: str
    payment_method: str
    amount_mwk: float

    model_config = {"from_attributes": True}
