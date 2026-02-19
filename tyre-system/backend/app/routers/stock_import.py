import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, Body, Depends, File, Query, UploadFile
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.common import ApiResponse
from app.schemas.stock_import import (
    ImportConfirmItem,
    StockImportLogResponse,
    TyreImportConfirmItem,
)
from app.services import stock_import_service

router = APIRouter(prefix="/stock-import", tags=["stock-import"])


def _save_upload(upload: UploadFile) -> Path:
    suffix = Path(upload.filename or "upload.xlsx").suffix or ".xlsx"
    fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    try:
        with open(fd, "wb") as f:
            shutil.copyfileobj(upload.file, f)
    except Exception:
        Path(tmp_path).unlink(missing_ok=True)
        raise
    return Path(tmp_path)


@router.post("/preview")
async def preview_stock_import(
    file: UploadFile = File(...),
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    product_type: str = Query("phone"),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Upload Excel file and preview matches without importing."""
    tmp_path = _save_upload(file)
    try:
        if product_type == "tyre":
            result = await stock_import_service.preview_tyre_import(
                db, str(tmp_path), file.filename or "unknown.xlsx", year, month,
            )
        else:
            result = await stock_import_service.preview_import(
                db, str(tmp_path), file.filename or "unknown.xlsx", year, month,
            )
        return ApiResponse.ok(result.model_dump())
    except Exception as e:
        return ApiResponse.fail(f"Preview failed: {e}")
    finally:
        tmp_path.unlink(missing_ok=True)


@router.post("/confirm")
async def confirm_stock_import(
    body: list[dict] = Body(...),
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    file_name: str = Query(...),
    product_type: str = Query("phone"),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Confirm and execute the stock import."""
    try:
        if product_type == "tyre":
            tyre_items = [TyreImportConfirmItem(**item) for item in body]
            log = await stock_import_service.confirm_tyre_import(
                db, year, month, file_name, tyre_items,
            )
        else:
            items = [ImportConfirmItem(**item) for item in body]
            log = await stock_import_service.confirm_import(
                db, year, month, file_name, items,
            )
        return ApiResponse.ok(
            StockImportLogResponse.model_validate(log).model_dump()
        )
    except ValidationError as e:
        return ApiResponse.fail(f"Invalid data: {e}")
    except Exception as e:
        return ApiResponse.fail(f"Import failed: {e}")


@router.post("/{log_id}/revert")
async def revert_stock_import(
    log_id: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Undo a previous stock import."""
    try:
        log = await stock_import_service.revert_import(db, log_id)
        return ApiResponse.ok(
            StockImportLogResponse.model_validate(log).model_dump()
        )
    except ValueError as e:
        return ApiResponse.fail(str(e))
    except Exception as e:
        return ApiResponse.fail(f"Revert failed: {e}")


@router.get("/history")
async def get_import_history(
    product_type: str = Query("phone"),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[dict]]:
    """Get import history for undo operations."""
    logs = await stock_import_service.get_import_history(db, product_type)
    return ApiResponse.ok(
        [StockImportLogResponse.model_validate(log).model_dump() for log in logs]
    )
