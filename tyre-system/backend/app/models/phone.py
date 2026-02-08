from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Phone(Base):
    __tablename__ = "phones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    brand: Mapped[str] = mapped_column(String(100), nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    config: Mapped[str] = mapped_column(String(100), nullable=False)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    cash_price: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    mukuru_price: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    online_price: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    excel_row: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    phone_inventory_periods = relationship(
        "PhoneInventoryPeriod", back_populates="phone", lazy="selectin"
    )
    phone_sales = relationship("PhoneSale", back_populates="phone", lazy="selectin")
    phone_losses = relationship("PhoneLoss", back_populates="phone", lazy="selectin")
