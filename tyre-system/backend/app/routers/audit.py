import shutil
import tempfile
import time
from pathlib import Path

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.audit_transaction import TransactionType
from app.schemas.audit import (
    AccountBalanceResponse,
    AccountCreate,
    AccountResponse,
    AccountUpdate,
    BalanceOverrideSet,
    ExchangeCreate,
    ExpenseCreate,
    ImportResult,
    IncomeCreate,
    RevenueBreakdown,
    TransactionFilter,
    TransactionResponse,
    TransferCreate,
)
from app.schemas.common import ApiResponse
from app.services import audit_service

router = APIRouter(prefix="/audit", tags=["audit"])

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB


# --- Helpers ---


def _build_account_name_map(accounts) -> dict[int, str]:
    return {a.id: a.name for a in accounts}


def _txn_to_response(
    txn, acct_map: dict[int, str]
) -> TransactionResponse:
    resp = TransactionResponse.model_validate(txn)
    resp.account_name = acct_map.get(txn.account_id)
    resp.from_account_name = acct_map.get(txn.from_account_id)
    resp.to_account_name = acct_map.get(txn.to_account_id)
    return resp


# --- Account Endpoints ---


@router.get("/accounts")
async def list_accounts(
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[AccountResponse]]:
    accounts = await audit_service.get_accounts(db)
    return ApiResponse.ok([AccountResponse.model_validate(a) for a in accounts])


@router.post("/accounts")
async def create_account(
    body: AccountCreate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[AccountResponse]:
    try:
        account = await audit_service.create_account(db, body)
        return ApiResponse.ok(AccountResponse.model_validate(account))
    except Exception as e:
        return ApiResponse.fail(str(e))


@router.put("/accounts/{account_id}")
async def update_account(
    account_id: int,
    body: AccountUpdate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[AccountResponse]:
    account = await audit_service.update_account(db, account_id, body)
    if account is None:
        return ApiResponse.fail(f"Account with id {account_id} not found")
    return ApiResponse.ok(AccountResponse.model_validate(account))


@router.delete("/accounts/{account_id}")
async def delete_account(
    account_id: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    try:
        deleted = await audit_service.delete_account(db, account_id)
        if not deleted:
            return ApiResponse.fail(f"Account with id {account_id} not found")
        return ApiResponse.ok(None)
    except ValueError as e:
        return ApiResponse.fail(str(e))


# --- Balance & Revenue ---


@router.get("/balances/{year}/{month}")
async def get_balances(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[AccountBalanceResponse]]:
    if not 1 <= month <= 12:
        return ApiResponse.fail("Month must be between 1 and 12")
    balances = await audit_service.get_account_balances(db, year, month)
    return ApiResponse.ok(balances)


@router.put("/balances/{account_id}/{year}/{month}/override")
async def set_balance_override(
    account_id: int,
    year: int,
    month: int,
    body: BalanceOverrideSet,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    """Set or update the initial balance override for a specific account+month."""
    if not 1 <= month <= 12:
        return ApiResponse.fail("Month must be between 1 and 12")
    try:
        await audit_service.set_balance_override(
            db, account_id, year, month, body.override_balance
        )
        return ApiResponse.ok(None)
    except Exception as e:
        return ApiResponse.fail(str(e))


@router.delete("/balances/{account_id}/{year}/{month}/override")
async def clear_balance_override(
    account_id: int,
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    """Remove the initial balance override, reverting to auto-calculated."""
    if not 1 <= month <= 12:
        return ApiResponse.fail("Month must be between 1 and 12")
    removed = await audit_service.clear_balance_override(db, account_id, year, month)
    if not removed:
        return ApiResponse.fail("No override found for this account/month")
    return ApiResponse.ok(None)


@router.get("/revenue/{year}/{month}")
async def get_revenue(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[RevenueBreakdown]:
    if not 1 <= month <= 12:
        return ApiResponse.fail("Month must be between 1 and 12")
    revenue = await audit_service.get_revenue_breakdown(db, year, month)
    return ApiResponse.ok(revenue)


# --- Transaction Endpoints ---


@router.get("/transactions")
async def list_transactions(
    year: int = Query(default=None),
    month: int = Query(default=None, ge=1, le=12),
    transaction_type: TransactionType | None = Query(default=None),
    account_id: int | None = Query(default=None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[TransactionResponse]]:
    filters = TransactionFilter(
        year=year,
        month=month,
        transaction_type=transaction_type,
        account_id=account_id,
        page=page,
        limit=limit,
    )
    txns, total = await audit_service.get_transactions(db, filters)
    accounts = await audit_service.get_accounts(db)
    acct_map = _build_account_name_map(accounts)

    responses = [_txn_to_response(txn, acct_map) for txn in txns]
    return ApiResponse.ok(
        responses,
        meta={"total": total, "page": page, "limit": limit},
    )


@router.post("/transactions/expense")
async def create_expense(
    body: ExpenseCreate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TransactionResponse]:
    try:
        txn = await audit_service.create_expense(db, body)
        accounts = await audit_service.get_accounts(db)
        acct_map = _build_account_name_map(accounts)
        return ApiResponse.ok(_txn_to_response(txn, acct_map))
    except ValueError as e:
        return ApiResponse.fail(str(e))


@router.post("/transactions/transfer")
async def create_transfer(
    body: TransferCreate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TransactionResponse]:
    try:
        txn = await audit_service.create_transfer(db, body)
        accounts = await audit_service.get_accounts(db)
        acct_map = _build_account_name_map(accounts)
        return ApiResponse.ok(_txn_to_response(txn, acct_map))
    except ValueError as e:
        return ApiResponse.fail(str(e))


@router.post("/transactions/exchange")
async def create_exchange(
    body: ExchangeCreate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TransactionResponse]:
    try:
        txn = await audit_service.create_exchange(db, body)
        accounts = await audit_service.get_accounts(db)
        acct_map = _build_account_name_map(accounts)
        return ApiResponse.ok(_txn_to_response(txn, acct_map))
    except ValueError as e:
        return ApiResponse.fail(str(e))


@router.post("/transactions/income")
async def create_income(
    body: IncomeCreate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TransactionResponse]:
    try:
        txn = await audit_service.create_income(db, body)
        accounts = await audit_service.get_accounts(db)
        acct_map = _build_account_name_map(accounts)
        return ApiResponse.ok(_txn_to_response(txn, acct_map))
    except ValueError as e:
        return ApiResponse.fail(str(e))


@router.delete("/transactions/{txn_id}")
async def delete_transaction(
    txn_id: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    deleted = await audit_service.delete_transaction(db, txn_id)
    if not deleted:
        return ApiResponse.fail(f"Transaction with id {txn_id} not found")
    return ApiResponse.ok(None)


# --- Receipt Image Upload ---


@router.post("/transactions/{txn_id}/receipt")
async def upload_receipt(
    txn_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TransactionResponse]:
    # Validate file extension
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        return ApiResponse.fail(
            f"Invalid image format. Allowed: {', '.join(ALLOWED_IMAGE_EXTENSIONS)}"
        )

    # Read and validate size
    content = await file.read()
    if len(content) > MAX_IMAGE_SIZE:
        return ApiResponse.fail("Image too large. Maximum 5MB.")

    # Save to receipts directory
    receipts_dir = settings.RECEIPTS_DIR
    receipts_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{txn_id}_{int(time.time())}{ext}"
    file_path = receipts_dir / filename
    file_path.write_bytes(content)

    txn = await audit_service.upload_receipt_image(db, txn_id, filename)
    if txn is None:
        file_path.unlink(missing_ok=True)
        return ApiResponse.fail(f"Transaction with id {txn_id} not found")

    accounts = await audit_service.get_accounts(db)
    acct_map = _build_account_name_map(accounts)
    return ApiResponse.ok(_txn_to_response(txn, acct_map))


@router.get("/receipts/{filename}")
async def get_receipt_image(filename: str):
    """Serve receipt image file."""
    # Sanitize filename to prevent path traversal
    safe_name = Path(filename).name
    file_path = settings.RECEIPTS_DIR / safe_name
    if not file_path.exists():
        return ApiResponse.fail("Receipt image not found")
    return FileResponse(file_path)


# --- Import from Excel ---


@router.post("/import")
async def import_audit_excel(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[ImportResult]:
    """Import expenses from Audit Excel file."""
    suffix = Path(file.filename or "upload.xlsx").suffix or ".xlsx"
    fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    try:
        with open(fd, "wb") as f:
            shutil.copyfileobj(file.file, f)

        # Get default account for attribution
        accounts = await audit_service.get_accounts(db)
        default_account = next((a for a in accounts if a.is_default), None)
        if default_account is None:
            return ApiResponse.fail("No default account found. Create one first.")

        result = await audit_service.import_from_audit_excel(
            db, tmp_path, default_account.id
        )
        return ApiResponse.ok(ImportResult(**result))
    except Exception as e:
        return ApiResponse.fail(f"Import failed: {e}")
    finally:
        Path(tmp_path).unlink(missing_ok=True)
