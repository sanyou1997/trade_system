from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.sale import PaymentMethod
from app.schemas.common import ApiResponse
from app.schemas.phone_sale import (
    PhoneSaleBulkCreate,
    PhoneSaleCreate,
    PhoneSaleFilter,
    PhoneSaleResponse,
)
from app.services import phone_sale_service

router = APIRouter(prefix="/phone-sales", tags=["phone-sales"])


def _sale_to_response(sale) -> PhoneSaleResponse:
    """Convert a PhoneSale ORM object to PhoneSaleResponse."""
    phone = sale.phone
    return PhoneSaleResponse(
        id=sale.id,
        sale_date=sale.sale_date,
        phone_id=sale.phone_id,
        quantity=sale.quantity,
        unit_price=sale.unit_price,
        discount=sale.discount,
        total=sale.total,
        payment_method=sale.payment_method,
        customer_name=sale.customer_name,
        synced=sale.synced,
        created_at=sale.created_at,
        phone_brand=phone.brand if phone else None,
        phone_model=phone.model if phone else None,
        phone_config=phone.config if phone else None,
    )


@router.post("")
async def create_sale(
    body: PhoneSaleCreate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[PhoneSaleResponse]:
    try:
        sale = await phone_sale_service.create_sale(db, body)
        return ApiResponse.ok(_sale_to_response(sale))
    except ValueError as e:
        return ApiResponse.fail(str(e))


@router.post("/bulk")
async def create_sales_bulk(
    body: PhoneSaleBulkCreate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[PhoneSaleResponse]]:
    try:
        sales = await phone_sale_service.create_sales_bulk(db, body.sales)
        return ApiResponse.ok([_sale_to_response(s) for s in sales])
    except ValueError as e:
        return ApiResponse.fail(str(e))


@router.get("")
async def get_sales(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    phone_id: int | None = Query(None),
    payment_method: PaymentMethod | None = Query(None),
    customer_name: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[PhoneSaleResponse]]:
    filters = PhoneSaleFilter(
        start_date=start_date,
        end_date=end_date,
        phone_id=phone_id,
        payment_method=payment_method,
        customer_name=customer_name,
        page=page,
        limit=limit,
    )
    sales, total = await phone_sale_service.get_sales(db, filters)
    return ApiResponse.ok(
        [_sale_to_response(s) for s in sales],
        meta={"total": total, "page": page, "limit": limit},
    )


@router.get("/daily/{target_date}")
async def get_daily_sales(
    target_date: date,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[PhoneSaleResponse]]:
    sales = await phone_sale_service.get_daily_sales(db, target_date)
    return ApiResponse.ok([_sale_to_response(s) for s in sales])


@router.get("/monthly/{year}/{month}")
async def get_monthly_sales(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[PhoneSaleResponse]]:
    if not 1 <= month <= 12:
        return ApiResponse.fail("Month must be between 1 and 12")
    sales = await phone_sale_service.get_monthly_sales(db, year, month)
    return ApiResponse.ok([_sale_to_response(s) for s in sales])


@router.delete("/{sale_id}")
async def delete_sale(
    sale_id: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    deleted = await phone_sale_service.delete_sale(db, sale_id)
    if not deleted:
        return ApiResponse.fail(f"Phone sale with id {sale_id} not found")
    return ApiResponse.ok(None)
