import enum
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class TyreCategory(str, enum.Enum):
    BRANDED_NEW = "branded_new"
    BRANDLESS_NEW = "brandless_new"
    SECOND_HAND = "second_hand"


class Tyre(Base):
    __tablename__ = "tyres"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    size: Mapped[str] = mapped_column(String(50), nullable=False)
    type_: Mapped[str] = mapped_column("type", String(50), nullable=False)
    brand: Mapped[str | None] = mapped_column(String(100), nullable=True)
    pattern: Mapped[str | None] = mapped_column(String(100), nullable=True)
    li_sr: Mapped[str | None] = mapped_column(String(20), nullable=True)
    tyre_cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    suggested_price: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    category: Mapped[TyreCategory] = mapped_column(
        Enum(TyreCategory),
        nullable=False,
        default=TyreCategory.BRANDED_NEW,
    )
    excel_row: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    inventory_periods = relationship("InventoryPeriod", back_populates="tyre", lazy="selectin")
    sales = relationship("Sale", back_populates="tyre", lazy="selectin")
    losses = relationship("Loss", back_populates="tyre", lazy="selectin")
