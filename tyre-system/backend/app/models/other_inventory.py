from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class OtherInventoryPeriod(Base):
    __tablename__ = "other_inventory_periods"
    __table_args__ = (
        UniqueConstraint(
            "other_product_id", "year", "month", name="uq_other_inventory_period"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    other_product_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("other_products.id", ondelete="CASCADE"),
        nullable=False,
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    initial_stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    added_stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Relationships
    other_product = relationship("OtherProduct", back_populates="other_inventory_periods")
