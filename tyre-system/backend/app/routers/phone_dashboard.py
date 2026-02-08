from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.common import ApiResponse
from app.services import phone_dashboard_service

router = APIRouter(prefix="/phone-dashboard", tags=["phone-dashboard"])


@router.get("/daily-summary/{target_date}")
async def get_daily_summary(
    target_date: date,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    summary = await phone_dashboard_service.get_daily_summary(db, target_date)
    return ApiResponse.ok(summary)


@router.get("/wechat-message/{target_date}")
async def get_wechat_message(
    target_date: date,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    msg = await phone_dashboard_service.generate_wechat_message(db, target_date)
    return ApiResponse.ok(msg)


@router.get("/monthly-stats/{year}/{month}")
async def get_monthly_stats(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    if not 1 <= month <= 12:
        return ApiResponse.fail("Month must be between 1 and 12")
    stats = await phone_dashboard_service.get_monthly_stats(db, year, month)
    return ApiResponse.ok(stats)


@router.get("/sales-trend/{year}/{month}")
async def get_sales_trend(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    if not 1 <= month <= 12:
        return ApiResponse.fail("Month must be between 1 and 12")
    trend = await phone_dashboard_service.get_sales_trend(db, year, month)
    return ApiResponse.ok(trend)
