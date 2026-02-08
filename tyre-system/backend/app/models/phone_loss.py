from datetime import date

from sqlalchemy import Date, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.loss import LossType


class PhoneLoss(Base):
    __tablename__ = "phone_losses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    loss_date: Mapped[date] = mapped_column(Date, nullable=False)
    phone_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("phones.id", ondelete="CASCADE"),
        nullable=False,
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    loss_type: Mapped[LossType] = mapped_column(Enum(LossType), nullable=False)
    refund_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Relationships
    phone = relationship("Phone", back_populates="phone_losses")
