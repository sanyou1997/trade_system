from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class PhoneInventoryPeriod(Base):
    __tablename__ = "phone_inventory_periods"
    __table_args__ = (
        UniqueConstraint(
            "phone_id", "year", "month", name="uq_phone_inventory_period"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    phone_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("phones.id", ondelete="CASCADE"),
        nullable=False,
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    initial_stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    added_stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Relationships
    phone = relationship("Phone", back_populates="phone_inventory_periods")
