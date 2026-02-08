from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.sale import PaymentMethod
from app.schemas.common import ApiResponse
from app.schemas.sale import SaleBulkCreate, SaleCreate, SaleFilter, SaleResponse
from app.services import sale_service

router = APIRouter(prefix="/sales", tags=["sales"])


def _sale_to_response(sale) -> SaleResponse:
    """Convert a Sale ORM object to SaleResponse with joined tyre fields."""
    tyre = sale.tyre
    return SaleResponse(
        id=sale.id,
        sale_date=sale.sale_date,
        tyre_id=sale.tyre_id,
        quantity=sale.quantity,
        unit_price=sale.unit_price,
        discount=sale.discount,
        total=sale.total,
        payment_method=sale.payment_method,
        customer_name=sale.customer_name,
        synced=sale.synced,
        created_at=sale.created_at,
        tyre_size=tyre.size if tyre else None,
        tyre_brand=tyre.brand if tyre else None,
        tyre_type=tyre.type_ if tyre else None,
    )


@router.post("")
async def create_sale(
    body: SaleCreate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[SaleResponse]:
    try:
        sale = await sale_service.create_sale(db, body)
        return ApiResponse.ok(_sale_to_response(sale))
    except ValueError as e:
        return ApiResponse.fail(str(e))


@router.post("/bulk")
async def create_sales_bulk(
    body: SaleBulkCreate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[SaleResponse]]:
    try:
        sales = await sale_service.create_sales_bulk(db, body.sales)
        return ApiResponse.ok([_sale_to_response(s) for s in sales])
    except ValueError as e:
        return ApiResponse.fail(str(e))


@router.get("")
async def get_sales(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    tyre_id: int | None = Query(None),
    payment_method: PaymentMethod | None = Query(None),
    customer_name: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[SaleResponse]]:
    filters = SaleFilter(
        start_date=start_date,
        end_date=end_date,
        tyre_id=tyre_id,
        payment_method=payment_method,
        customer_name=customer_name,
        page=page,
        limit=limit,
    )
    sales, total = await sale_service.get_sales(db, filters)
    return ApiResponse.ok(
        [_sale_to_response(s) for s in sales],
        meta={"total": total, "page": page, "limit": limit},
    )


@router.get("/daily/{target_date}")
async def get_daily_sales(
    target_date: date,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[SaleResponse]]:
    sales = await sale_service.get_daily_sales(db, target_date)
    return ApiResponse.ok([_sale_to_response(s) for s in sales])


@router.get("/monthly/{year}/{month}")
async def get_monthly_sales(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[SaleResponse]]:
    if not 1 <= month <= 12:
        return ApiResponse.fail("Month must be between 1 and 12")
    sales = await sale_service.get_monthly_sales(db, year, month)
    return ApiResponse.ok([_sale_to_response(s) for s in sales])


@router.delete("/{sale_id}")
async def delete_sale(
    sale_id: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    deleted = await sale_service.delete_sale(db, sale_id)
    if not deleted:
        return ApiResponse.fail(f"Sale with id {sale_id} not found")
    return ApiResponse.ok(None)
