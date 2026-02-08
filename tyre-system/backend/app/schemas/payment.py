from datetime import date

from pydantic import BaseModel, Field


class PaymentCreate(BaseModel):
    payment_date: date
    customer: str = Field(..., min_length=1, max_length=200)
    payment_method: str = Field(..., min_length=1, max_length=50)
    amount_mwk: float = Field(..., gt=0)
    product_type: str = Field("tyre", pattern=r"^(tyre|phone)$")


class PaymentResponse(BaseModel):
    id: int
    payment_date: date
    customer: str
    payment_method: str
    amount_mwk: float
    product_type: str = "tyre"

    model_config = {"from_attributes": True}
