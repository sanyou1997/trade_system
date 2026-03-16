from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class OtherProduct(Base):
    __tablename__ = "other_products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    suggested_price: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    excel_row: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    other_inventory_periods = relationship(
        "OtherInventoryPeriod", back_populates="other_product", lazy="selectin"
    )
    other_sales = relationship("OtherSale", back_populates="other_product", lazy="selectin")
    other_losses = relationship("OtherLoss", back_populates="other_product", lazy="selectin")
