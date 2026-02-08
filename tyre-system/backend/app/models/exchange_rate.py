import enum

from sqlalchemy import Enum, Float, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class RateType(str, enum.Enum):
    MUKURU = "mukuru"
    CASH = "cash"


class ExchangeRate(Base):
    __tablename__ = "exchange_rates"
    __table_args__ = (
        UniqueConstraint("year", "month", "rate_type", name="uq_rate_period_type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    rate_type: Mapped[RateType] = mapped_column(Enum(RateType), nullable=False)
    rate: Mapped[float] = mapped_column(Float, nullable=False)
