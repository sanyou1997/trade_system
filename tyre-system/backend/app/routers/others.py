import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.other_product import OtherProduct
from app.models.other_inventory import OtherInventoryPeriod
from app.models.other_sale import OtherSale
from app.schemas.common import ApiResponse
from app.schemas.other_product import (
    OtherProductCreate,
    OtherProductResponse,
    OtherProductUpdate,
    OtherProductWithStock,
)

router = APIRouter(prefix="/others", tags=["others"])


@router.get("")
async def list_others(
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[OtherProductResponse]]:
    result = await db.execute(select(OtherProduct).order_by(OtherProduct.id))
    products = result.scalars().all()
    return ApiResponse.ok([OtherProductResponse.model_validate(p) for p in products])


@router.get("/with-stock")
async def list_others_with_stock(
    year: int = Query(default=None),
    month: int = Query(default=None, ge=1, le=12),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[OtherProductWithStock]]:
    now = datetime.date.today()
    year = year or now.year
    month = month or now.month
    result = await db.execute(select(OtherProduct).order_by(OtherProduct.id))
    products = result.scalars().all()

    items = []
    for product in products:
        inv_result = await db.execute(
            select(OtherInventoryPeriod).where(
                OtherInventoryPeriod.other_product_id == product.id,
                OtherInventoryPeriod.year == year,
                OtherInventoryPeriod.month == month,
            )
        )
        inv = inv_result.scalar_one_or_none()
        initial = inv.initial_stock if inv else 0
        added = inv.added_stock if inv else 0

        sold_result = await db.execute(
            select(func.coalesce(func.sum(OtherSale.quantity), 0)).where(
                OtherSale.other_product_id == product.id,
                func.extract("year", OtherSale.sale_date) == year,
                func.extract("month", OtherSale.sale_date) == month,
            )
        )
        total_sold = sold_result.scalar()
        remaining = initial + added - total_sold

        product_data = OtherProductResponse.model_validate(product)
        items.append(
            OtherProductWithStock(
                **product_data.model_dump(),
                initial_stock=initial,
                added_stock=added,
                total_sold=total_sold,
                remaining_stock=remaining,
            )
        )

    return ApiResponse.ok(items)


@router.get("/{product_id}")
async def get_other(
    product_id: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[OtherProductResponse]:
    result = await db.execute(
        select(OtherProduct).where(OtherProduct.id == product_id)
    )
    product = result.scalar_one_or_none()
    if product is None:
        return ApiResponse.fail(f"Other product with id {product_id} not found")
    return ApiResponse.ok(OtherProductResponse.model_validate(product))


@router.post("")
async def create_other(
    body: OtherProductCreate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[OtherProductResponse]:
    product = OtherProduct(
        name=body.name,
        cost=body.cost,
        suggested_price=body.suggested_price,
        category=body.category,
        note=body.note,
        excel_row=body.excel_row,
    )
    db.add(product)
    await db.commit()
    return ApiResponse.ok(OtherProductResponse.model_validate(product))


@router.put("/{product_id}")
async def update_other(
    product_id: int,
    body: OtherProductUpdate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[OtherProductResponse]:
    result = await db.execute(
        select(OtherProduct).where(OtherProduct.id == product_id)
    )
    product = result.scalar_one_or_none()
    if product is None:
        return ApiResponse.fail(f"Other product with id {product_id} not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(product, field, value)

    await db.commit()
    return ApiResponse.ok(OtherProductResponse.model_validate(product))


@router.delete("/{product_id}")
async def delete_other(
    product_id: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    result = await db.execute(
        select(OtherProduct).where(OtherProduct.id == product_id)
    )
    product = result.scalar_one_or_none()
    if product is None:
        return ApiResponse.fail(f"Other product with id {product_id} not found")
    await db.delete(product)
    await db.commit()
    return ApiResponse.ok(None)
