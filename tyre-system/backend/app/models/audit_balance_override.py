from sqlalchemy import Float, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AuditBalanceOverride(Base):
    """Per-account, per-month override for the initial balance (prev month carry-over)."""

    __tablename__ = "audit_balance_overrides"
    __table_args__ = (
        UniqueConstraint("account_id", "year", "month", name="uq_override_acct_ym"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("audit_accounts.id", ondelete="CASCADE"), nullable=False
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    override_balance: Mapped[float] = mapped_column(Float, nullable=False)
