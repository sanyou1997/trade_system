from datetime import date

from pydantic import BaseModel


class DailySummary(BaseModel):
    date: date
    total_sold_today: int
    total_sold_month: int
    total_remaining: int
    revenue_cash_mwk: float
    revenue_mukuru_mwk: float
    revenue_card_mwk: float
    total_revenue_mwk: float


class MonthlyStats(BaseModel):
    year: int
    month: int
    total_sold: int
    total_broken: int
    total_loss: int
    total_remaining: int
    revenue_mwk: float
    revenue_cny: float
    partner_share_cny: float
    sanyou_share_cny: float
    cash_rate: float
    mukuru_rate: float


class WeChatMessage(BaseModel):
    date: date
    message: str


class SalesTrendItem(BaseModel):
    day: int
    quantity: int
    revenue: float


class SalesTrend(BaseModel):
    year: int
    month: int
    daily_data: list[SalesTrendItem]
    total_quantity: int
    total_revenue: float
