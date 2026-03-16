from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.sale import PaymentMethod


class OtherSale(Base):
    __tablename__ = "other_sales"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sale_date: Mapped[date] = mapped_column(Date, nullable=False)
    other_product_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("other_products.id", ondelete="CASCADE"),
        nullable=False,
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float] = mapped_column(Float, nullable=False)
    discount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total: Mapped[float] = mapped_column(Float, nullable=False)
    payment_method: Mapped[PaymentMethod] = mapped_column(
        Enum(PaymentMethod),
        nullable=False,
    )
    customer_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    synced: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    other_product = relationship("OtherProduct", back_populates="other_sales")
