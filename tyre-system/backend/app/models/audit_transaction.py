import enum
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class TransactionType(str, enum.Enum):
    EXPENSE = "expense"
    TRANSFER = "transfer"
    EXCHANGE = "exchange"
    INCOME = "income"


class AuditTransaction(Base):
    __tablename__ = "audit_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    transaction_type: Mapped[TransactionType] = mapped_column(
        Enum(TransactionType), nullable=False
    )
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    amount_mwk: Mapped[float] = mapped_column(Float, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Account affected (expense, exchange, income)
    account_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("audit_accounts.id", ondelete="SET NULL"), nullable=True
    )
    receipt_info: Mapped[str | None] = mapped_column(String(500), nullable=True)
    receipt_image: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Transfer fields
    from_account_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("audit_accounts.id", ondelete="SET NULL"), nullable=True
    )
    to_account_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("audit_accounts.id", ondelete="SET NULL"), nullable=True
    )

    # Exchange fields
    exchange_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    amount_cny: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
