from datetime import datetime

from pydantic import BaseModel, Field


class OtherProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    cost: float = Field(0.0, ge=0)
    suggested_price: float = Field(0.0, ge=0)
    category: str | None = Field(None, max_length=100)
    note: str | None = Field(None, max_length=500)
    excel_row: int | None = None


class OtherProductUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    cost: float | None = Field(None, ge=0)
    suggested_price: float | None = Field(None, ge=0)
    category: str | None = Field(None, max_length=100)
    note: str | None = Field(None, max_length=500)
    excel_row: int | None = None


class OtherProductResponse(BaseModel):
    id: int
    name: str
    cost: float
    suggested_price: float
    category: str | None
    note: str | None
    excel_row: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class OtherProductWithStock(OtherProductResponse):
    initial_stock: int = 0
    added_stock: int = 0
    total_sold: int = 0
    remaining_stock: int = 0
