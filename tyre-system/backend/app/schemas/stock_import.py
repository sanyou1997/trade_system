from datetime import datetime

from pydantic import BaseModel, Field


class ImportPreviewItem(BaseModel):
    row_number: int
    brand: str
    model: str
    config: str
    quantity: int
    matched: bool
    phone_id: int | None = None
    current_added_stock: int | None = None


class ImportPreviewResult(BaseModel):
    file_name: str
    total_rows: int
    matched_rows: int
    unmatched_rows: int
    total_quantity: int
    items: list[ImportPreviewItem]
    all_matched: bool


class ImportConfirmItem(BaseModel):
    phone_id: int
    quantity: int = Field(..., gt=0)
    brand: str
    model: str
    config: str


class StockImportLogResponse(BaseModel):
    id: int
    product_type: str
    year: int
    month: int
    file_name: str
    total_quantity: int
    total_products: int
    status: str
    reverted_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
