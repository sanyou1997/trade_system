from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.payment import Payment
from app.models.sale import Sale
from app.schemas.common import ApiResponse
from app.schemas.payment import PaymentCreate, PaymentResponse

router = APIRouter(prefix="/payments", tags=["payments"])


@router.get("")
async def list_payments(
    year: int = Query(default=None),
    month: int = Query(default=None, ge=1, le=12),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[PaymentResponse]]:
    query = select(Payment)
    if year and month:
        query = query.where(
            func.extract("year", Payment.payment_date) == year,
            func.extract("month", Payment.payment_date) == month,
        )
    query = query.order_by(Payment.payment_date.desc())
    result = await db.execute(query)
    payments = result.scalars().all()
    return ApiResponse.ok(
        [PaymentResponse.model_validate(p) for p in payments]
    )


@router.get("/receivables/{year}/{month}")
async def get_receivables(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Per-customer receivables: sales total vs payments received."""
    if not 1 <= month <= 12:
        return ApiResponse.fail("Month must be between 1 and 12")

    # Sales totals by customer
    sales_result = await db.execute(
        select(
            Sale.customer_name,
            func.sum(Sale.total).label("total_sales"),
            func.count(Sale.id).label("sale_count"),
        )
        .where(
            func.extract("year", Sale.sale_date) == year,
            func.extract("month", Sale.sale_date) == month,
            Sale.customer_name.isnot(None),
            Sale.customer_name != "",
        )
        .group_by(Sale.customer_name)
    )
    sales_by_customer = {
        row.customer_name: {"total_sales": float(row.total_sales), "sale_count": int(row.sale_count)}
        for row in sales_result.all()
    }

    # Payments totals by customer
    payments_result = await db.execute(
        select(
            Payment.customer,
            func.sum(Payment.amount_mwk).label("total_paid"),
        )
        .where(
            func.extract("year", Payment.payment_date) == year,
            func.extract("month", Payment.payment_date) == month,
        )
        .group_by(Payment.customer)
    )
    payments_by_customer = {
        row.customer: float(row.total_paid) for row in payments_result.all()
    }

    # Merge into receivables list
    all_customers = set(sales_by_customer.keys()) | set(payments_by_customer.keys())
    receivables = []
    for customer in sorted(all_customers):
        sales_info = sales_by_customer.get(customer, {"total_sales": 0, "sale_count": 0})
        total_sales = sales_info["total_sales"]
        sale_count = sales_info["sale_count"]
        total_paid = payments_by_customer.get(customer, 0)
        outstanding = round(total_sales - total_paid, 2)
        receivables.append({
            "customer": customer,
            "total_sales": total_sales,
            "sale_count": sale_count,
            "total_paid": total_paid,
            "outstanding": outstanding,
        })

    # Sort: unpaid first (highest outstanding at top)
    receivables.sort(key=lambda r: r["outstanding"], reverse=True)

    total_outstanding = sum(r["outstanding"] for r in receivables)

    return ApiResponse.ok({
        "year": year,
        "month": month,
        "receivables": receivables,
        "total_outstanding": round(total_outstanding, 2),
    })


@router.get("/totals/{year}/{month}")
async def get_payment_totals(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    if not 1 <= month <= 12:
        return ApiResponse.fail("Month must be between 1 and 12")

    result = await db.execute(
        select(
            Payment.payment_method,
            func.sum(Payment.amount_mwk).label("total"),
        )
        .where(
            func.extract("year", Payment.payment_date) == year,
            func.extract("month", Payment.payment_date) == month,
        )
        .group_by(Payment.payment_method)
    )
    rows = result.all()

    totals = {row.payment_method: float(row.total) for row in rows}
    grand_total = sum(totals.values())

    return ApiResponse.ok({
        "year": year,
        "month": month,
        "by_method": totals,
        "grand_total": grand_total,
    })


@router.get("/{payment_id}")
async def get_payment(
    payment_id: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[PaymentResponse]:
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if payment is None:
        return ApiResponse.fail(f"Payment with id {payment_id} not found")
    return ApiResponse.ok(PaymentResponse.model_validate(payment))


@router.post("")
async def create_payment(
    body: PaymentCreate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[PaymentResponse]:
    payment = Payment(
        payment_date=body.payment_date,
        customer=body.customer,
        payment_method=body.payment_method,
        amount_mwk=body.amount_mwk,
    )
    db.add(payment)
    await db.commit()
    return ApiResponse.ok(PaymentResponse.model_validate(payment))


@router.delete("/{payment_id}")
async def delete_payment(
    payment_id: int,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if payment is None:
        return ApiResponse.fail(f"Payment with id {payment_id} not found")
    await db.delete(payment)
    await db.commit()
    return ApiResponse.ok(None)
