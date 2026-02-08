from datetime import datetime

from pydantic import BaseModel, Field

from app.models.tyre import TyreCategory


class TyreCreate(BaseModel):
    size: str = Field(..., min_length=1, max_length=50)
    type_: str = Field(..., alias="type", min_length=1, max_length=50)
    brand: str | None = Field(None, max_length=100)
    pattern: str | None = Field(None, max_length=100)
    li_sr: str | None = Field(None, max_length=20)
    tyre_cost: float = Field(0.0, ge=0)
    suggested_price: float = Field(0.0, ge=0)
    category: TyreCategory = TyreCategory.BRANDED_NEW
    excel_row: int | None = None

    model_config = {"populate_by_name": True}


class TyreUpdate(BaseModel):
    size: str | None = Field(None, min_length=1, max_length=50)
    type_: str | None = Field(None, alias="type", min_length=1, max_length=50)
    brand: str | None = Field(None, max_length=100)
    pattern: str | None = Field(None, max_length=100)
    li_sr: str | None = Field(None, max_length=20)
    tyre_cost: float | None = Field(None, ge=0)
    suggested_price: float | None = Field(None, ge=0)
    category: TyreCategory | None = None
    excel_row: int | None = None

    model_config = {"populate_by_name": True}


class TyreResponse(BaseModel):
    id: int
    size: str
    type_: str = Field(..., alias="type")
    brand: str | None
    pattern: str | None
    li_sr: str | None
    tyre_cost: float
    suggested_price: float
    category: TyreCategory
    excel_row: int | None
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class TyreWithStock(TyreResponse):
    initial_stock: int = 0
    added_stock: int = 0
    total_sold: int = 0
    remaining_stock: int = 0
