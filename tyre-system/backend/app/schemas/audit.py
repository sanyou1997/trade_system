from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.audit_transaction import TransactionType


# --- Account Schemas ---


class AccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    initial_balance: float = Field(0.0)
    is_default: bool = False


class AccountUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    initial_balance: float | None = None
    is_default: bool | None = None


class AccountResponse(BaseModel):
    id: int
    name: str
    description: str | None
    initial_balance: float
    is_default: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AccountBalanceResponse(BaseModel):
    id: int
    name: str
    description: str | None
    initial_balance: float  # account's raw initial_balance field
    is_default: bool
    prev_balance: float  # cumulative through prev month (or manual override)
    has_override: bool = False  # True if prev_balance was manually set
    auto_revenue: float  # current month only
    manual_income: float  # current month only
    total_expenses: float  # current month only
    total_exchanges: float  # current month only
    transfers_in: float  # current month only
    transfers_out: float  # current month only
    calculated_balance: float  # prev_balance + this month's movements


class BalanceOverrideSet(BaseModel):
    override_balance: float


# --- Transaction Schemas ---


class ExpenseCreate(BaseModel):
    transaction_date: date
    description: str = Field(..., min_length=1)
    amount_mwk: float = Field(..., gt=0)
    account_id: int
    receipt_info: str | None = None
    note: str | None = None


class TransferCreate(BaseModel):
    transaction_date: date
    amount_mwk: float = Field(..., gt=0)
    from_account_id: int
    to_account_id: int
    description: str | None = None
    note: str | None = None


class ExchangeCreate(BaseModel):
    transaction_date: date
    amount_mwk: float = Field(..., gt=0)
    exchange_rate: float = Field(..., gt=0)
    amount_cny: float = Field(..., gt=0)
    account_id: int
    description: str | None = None
    note: str | None = None


class IncomeCreate(BaseModel):
    transaction_date: date
    description: str = Field(..., min_length=1)
    amount_mwk: float = Field(..., gt=0)
    account_id: int
    note: str | None = None


class TransactionResponse(BaseModel):
    id: int
    transaction_type: TransactionType
    transaction_date: date
    description: str | None
    amount_mwk: float
    note: str | None
    account_id: int | None
    receipt_info: str | None
    receipt_image: str | None
    from_account_id: int | None
    to_account_id: int | None
    exchange_rate: float | None
    amount_cny: float | None
    created_at: datetime

    # Joined names
    account_name: str | None = None
    from_account_name: str | None = None
    to_account_name: str | None = None

    model_config = {"from_attributes": True}


class TransactionFilter(BaseModel):
    year: int | None = None
    month: int | None = None
    transaction_type: TransactionType | None = None
    account_id: int | None = None
    page: int = Field(1, ge=1)
    limit: int = Field(50, ge=1, le=200)


# --- Revenue Schemas ---


class RevenueBreakdown(BaseModel):
    tyre_cash: float = 0.0
    tyre_mukuru: float = 0.0
    tyre_card: float = 0.0
    tyre_total: float = 0.0
    phone_cash: float = 0.0
    phone_mukuru: float = 0.0
    phone_card: float = 0.0
    phone_total: float = 0.0
    grand_total: float = 0.0


# --- Import Schema ---


class ImportResult(BaseModel):
    expenses_imported: int
    exchanges_imported: int
    skipped: int
    errors: list[str]
