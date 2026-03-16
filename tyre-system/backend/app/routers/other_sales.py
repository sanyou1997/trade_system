from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.sale import PaymentMethod
from app.schemas.common import ApiResponse
from app.schemas.other_sale import (
    OtherSaleBulkCreate,
    OtherSaleCreate,
    OtherSaleFilter,
    OtherSaleResponse,
)
from app.services import other_sale_service

router = APIRouter(prefix="/other-sales", tags=["other-sales"])


def _sale_to_response(sale) -> OtherSaleResponse:
    """Convert an OtherSale ORM object to OtherSaleResponse."""
    product = sale.other_product
    return OtherSaleResponse(
        id=sale.id,
        sale_date=sale.sale_date,
        other_product_id=sale.other_product_id,
        quantity=sale.quantity,
        unit_price=sale.unit_price,
        discount=sale.discount,
        total=sale.total,
        payment_method=sale.payment_method,
        customer_name=sale.customer_name,
        synced=sale.synced,
        created_at=sale.created_at,
        product_name=product.name if product else None,
    )


@router.post("")
async def create_sale(
    body: OtherSaleCreate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[OtherSaleResponse]:
    try:
        sale = await other_sale_service.create_sale(db, body)
        return ApiResponse.ok(_sale_to_response(sale))
    except ValueError as e:
        return ApiResponse.fail(str(e))


@router.post("/bulk")
async def create_sales_bulk(
    body: OtherSaleBulkCreate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[OtherSaleResponse]]:
    try:
        sales = await other_sale_service.create_sales_bulk(db, body.sales)
        return ApiResponse.ok([_sale_to_response(s) for s in sales])
    except ValueError as e:
        return ApiResponse.fail(str(e))


@router.get("")
async def get_sales(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    other_product_id: int | None = Query(None),
    payment_method: PaymentMethod | None = Query(None),
    customer_name: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[OtherSaleResponse]]:
    filters = OtherSaleFilter(
        start_date=start_date,
        end_date=end_date,
        other_product_id=other_product_id,
        payment_method=payment_method,
        customer_name=customer_name,
        page=page,
        limit=limit,
    )
    sales, total = await other_sale_service.get_sales(db, filters)
    return ApiResponse.ok(
        [_sale_to_response(s) for s in sales],
        meta={"total": total, "page": page, "limit": limit},
    )


@router.get("/daily/{target_date}")
async def get_daily_sales(
    target_date: date,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[OtherSaleResponse]]:
    sales = await other_sale_service.get_daily_sales(db, target_date)
    return ApiResponse.ok([_sale_to_response(s) for s in sales])


@router.get("/monthly/{year}/{month}")
async def get_monthly_sales(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[OtherSaleResponse]]:
    if not 1 <= month <= 12:
        return ApiResponse.fail("Month must be between 1 and 12")
    sales = await other_sale_service.get_monthly_sales(db, year, month)
    return ApiResponse.ok([_sale_to_response(s) for s in sales])


@router.delete("/{sale_id}")
async def delete_sale(
    sale_id: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    deleted = await other_sale_service.delete_sale(db, sale_id)
    if not deleted:
        return ApiResponse.fail(f"Other sale with id {sale_id} not found")
    return ApiResponse.ok(None)
