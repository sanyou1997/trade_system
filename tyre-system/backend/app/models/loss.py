import enum
from datetime import date

from sqlalchemy import Date, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class LossType(str, enum.Enum):
    BROKEN = "broken"
    EXCHANGE = "exchange"
    REFUND = "refund"


class Loss(Base):
    __tablename__ = "losses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    loss_date: Mapped[date] = mapped_column(Date, nullable=False)
    tyre_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("tyres.id", ondelete="CASCADE"),
        nullable=False,
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    loss_type: Mapped[LossType] = mapped_column(Enum(LossType), nullable=False)
    refund_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Relationships
    tyre = relationship("Tyre", back_populates="losses")
