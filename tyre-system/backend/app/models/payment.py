from datetime import date

from sqlalchemy import Date, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    customer: Mapped[str] = mapped_column(String(200), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(50), nullable=False)
    amount_mwk: Mapped[float] = mapped_column(Float, nullable=False)
    product_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="tyre", server_default="tyre"
    )
