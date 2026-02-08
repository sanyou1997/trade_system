import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.phone import Phone
from app.models.phone_inventory import PhoneInventoryPeriod
from app.models.phone_sale import PhoneSale
from app.schemas.common import ApiResponse
from app.schemas.phone import PhoneCreate, PhoneResponse, PhoneUpdate, PhoneWithStock

router = APIRouter(prefix="/phones", tags=["phones"])


@router.get("")
async def list_phones(
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[PhoneResponse]]:
    result = await db.execute(select(Phone).order_by(Phone.id))
    phones = result.scalars().all()
    return ApiResponse.ok([PhoneResponse.model_validate(p) for p in phones])


@router.get("/with-stock")
async def list_phones_with_stock(
    year: int = Query(default=None),
    month: int = Query(default=None, ge=1, le=12),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[PhoneWithStock]]:
    now = datetime.date.today()
    year = year or now.year
    month = month or now.month
    result = await db.execute(select(Phone).order_by(Phone.id))
    phones = result.scalars().all()

    items = []
    for phone in phones:
        inv_result = await db.execute(
            select(PhoneInventoryPeriod).where(
                PhoneInventoryPeriod.phone_id == phone.id,
                PhoneInventoryPeriod.year == year,
                PhoneInventoryPeriod.month == month,
            )
        )
        inv = inv_result.scalar_one_or_none()
        initial = inv.initial_stock if inv else 0
        added = inv.added_stock if inv else 0

        sold_result = await db.execute(
            select(func.coalesce(func.sum(PhoneSale.quantity), 0)).where(
                PhoneSale.phone_id == phone.id,
                func.extract("year", PhoneSale.sale_date) == year,
                func.extract("month", PhoneSale.sale_date) == month,
            )
        )
        total_sold = sold_result.scalar()
        remaining = initial + added - total_sold

        phone_data = PhoneResponse.model_validate(phone)
        items.append(
            PhoneWithStock(
                **phone_data.model_dump(),
                initial_stock=initial,
                added_stock=added,
                total_sold=total_sold,
                remaining_stock=remaining,
            )
        )

    return ApiResponse.ok(items)


@router.get("/{phone_id}")
async def get_phone(
    phone_id: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[PhoneResponse]:
    result = await db.execute(select(Phone).where(Phone.id == phone_id))
    phone = result.scalar_one_or_none()
    if phone is None:
        return ApiResponse.fail(f"Phone with id {phone_id} not found")
    return ApiResponse.ok(PhoneResponse.model_validate(phone))


@router.post("")
async def create_phone(
    body: PhoneCreate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[PhoneResponse]:
    phone = Phone(
        brand=body.brand,
        model=body.model,
        config=body.config,
        note=body.note,
        cost=body.cost,
        cash_price=body.cash_price,
        mukuru_price=body.mukuru_price,
        online_price=body.online_price,
        status=body.status,
        excel_row=body.excel_row,
    )
    db.add(phone)
    await db.commit()
    return ApiResponse.ok(PhoneResponse.model_validate(phone))


@router.put("/{phone_id}")
async def update_phone(
    phone_id: int,
    body: PhoneUpdate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[PhoneResponse]:
    result = await db.execute(select(Phone).where(Phone.id == phone_id))
    phone = result.scalar_one_or_none()
    if phone is None:
        return ApiResponse.fail(f"Phone with id {phone_id} not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(phone, field, value)

    await db.commit()
    return ApiResponse.ok(PhoneResponse.model_validate(phone))


@router.delete("/{phone_id}")
async def delete_phone(
    phone_id: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    result = await db.execute(select(Phone).where(Phone.id == phone_id))
    phone = result.scalar_one_or_none()
    if phone is None:
        return ApiResponse.fail(f"Phone with id {phone_id} not found")
    await db.delete(phone)
    await db.commit()
    return ApiResponse.ok(None)
