from datetime import datetime

from pydantic import BaseModel, Field


class PhoneCreate(BaseModel):
    brand: str = Field(..., min_length=1, max_length=100)
    model: str = Field(..., min_length=1, max_length=100)
    config: str = Field(..., min_length=1, max_length=100)
    note: str | None = Field(None, max_length=500)
    cost: float = Field(0.0, ge=0)
    cash_price: float = Field(0.0, ge=0)
    mukuru_price: float = Field(0.0, ge=0)
    online_price: float = Field(0.0, ge=0)
    status: str | None = Field(None, max_length=50)
    excel_row: int | None = None


class PhoneUpdate(BaseModel):
    brand: str | None = Field(None, min_length=1, max_length=100)
    model: str | None = Field(None, min_length=1, max_length=100)
    config: str | None = Field(None, min_length=1, max_length=100)
    note: str | None = Field(None, max_length=500)
    cost: float | None = Field(None, ge=0)
    cash_price: float | None = Field(None, ge=0)
    mukuru_price: float | None = Field(None, ge=0)
    online_price: float | None = Field(None, ge=0)
    status: str | None = Field(None, max_length=50)
    excel_row: int | None = None


class PhoneResponse(BaseModel):
    id: int
    brand: str
    model: str
    config: str
    note: str | None
    cost: float
    cash_price: float
    mukuru_price: float
    online_price: float
    status: str | None
    excel_row: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PhoneWithStock(PhoneResponse):
    initial_stock: int = 0
    added_stock: int = 0
    total_sold: int = 0
    remaining_stock: int = 0
