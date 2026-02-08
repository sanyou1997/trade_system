from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.sale import PaymentMethod


class PhoneSaleCreate(BaseModel):
    sale_date: date
    phone_id: int
    quantity: int = Field(..., gt=0)
    unit_price: float = Field(..., gt=0)
    discount: float = Field(0.0, ge=0, le=100)
    payment_method: PaymentMethod
    customer_name: str | None = Field(None, max_length=200)


class PhoneSaleBulkCreate(BaseModel):
    sales: list[PhoneSaleCreate] = Field(..., min_length=1)


class PhoneSaleResponse(BaseModel):
    id: int
    sale_date: date
    phone_id: int
    quantity: int
    unit_price: float
    discount: float
    total: float
    payment_method: PaymentMethod
    customer_name: str | None
    synced: bool
    created_at: datetime

    # Joined fields
    phone_brand: str | None = None
    phone_model: str | None = None
    phone_config: str | None = None

    model_config = {"from_attributes": True}


class PhoneSaleFilter(BaseModel):
    start_date: date | None = None
    end_date: date | None = None
    phone_id: int | None = None
    payment_method: PaymentMethod | None = None
    customer_name: str | None = None
    page: int = Field(1, ge=1)
    limit: int = Field(50, ge=1, le=200)
