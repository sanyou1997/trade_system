from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, update

from app.config import settings
from app.database import async_session_factory, init_db
from app.models.user import User, UserRole
from app.routers import (
    auth,
    dashboard,
    inventory,
    losses,
    payments,
    sales,
    settings as settings_router,
    sync,
    tyres,
    phones,
    phone_sales,
    phone_inventory,
    phone_losses,
    phone_dashboard,
    phone_sync,
    stock_import,
    audit,
)
from app.models.sale import Sale
from app.models.inventory import InventoryPeriod
from app.models.phone_inventory import PhoneInventoryPeriod
from app.utils.auth import hash_password
from app.services.inventory_service import rollover_month
from app.services.phone_inventory_service import rollover_phone_month

import logging

logger = logging.getLogger(__name__)


async def _fix_inventory_rollover() -> None:
    """Re-rollover inventory so each month's initial = previous month's remaining."""
    async with async_session_factory() as session:
        # Find all distinct (year, month) with inventory records, ordered
        from sqlalchemy import func, distinct
        result = await session.execute(
            select(
                InventoryPeriod.year,
                InventoryPeriod.month,
            )
            .distinct()
            .order_by(InventoryPeriod.year, InventoryPeriod.month)
        )
        periods = result.all()
        if len(periods) < 2:
            return

        # For each consecutive pair, re-rollover
        for i in range(len(periods) - 1):
            from_year, from_month = periods[i]
            to_year, to_month = periods[i + 1]
            count = await rollover_month(
                session, from_year, from_month, to_year, to_month
            )
            if count > 0:
                logger.info(
                    "Fixed rollover %d/%d -> %d/%d: %d records updated",
                    from_year, from_month, to_year, to_month, count,
                )
        await session.commit()


async def _fix_phone_inventory_rollover() -> None:
    """Re-rollover phone inventory so each month's initial = previous month's remaining."""
    async with async_session_factory() as session:
        from sqlalchemy import func, distinct

        result = await session.execute(
            select(
                PhoneInventoryPeriod.year,
                PhoneInventoryPeriod.month,
            )
            .distinct()
            .order_by(PhoneInventoryPeriod.year, PhoneInventoryPeriod.month)
        )
        periods = result.all()
        if len(periods) < 2:
            return

        for i in range(len(periods) - 1):
            from_year, from_month = periods[i]
            to_year, to_month = periods[i + 1]
            count = await rollover_phone_month(
                session, from_year, from_month, to_year, to_month
            )
            if count > 0:
                logger.info(
                    "Fixed phone rollover %d/%d -> %d/%d: %d records updated",
                    from_year, from_month, to_year, to_month, count,
                )
        await session.commit()


async def _fix_discount_format() -> None:
    """One-time fix: convert decimal discounts (0.05) to percentage (5)."""
    async with async_session_factory() as session:
        result = await session.execute(
            update(Sale)
            .where(Sale.discount > 0, Sale.discount < 1)
            .values(discount=Sale.discount * 100)
        )
        if result.rowcount > 0:
            await session.commit()


async def _seed_admin() -> None:
    """Create default admin user if no users exist."""
    async with async_session_factory() as session:
        result = await session.execute(select(User).limit(1))
        if result.scalar_one_or_none() is not None:
            return

        admin = User(
            username="admin",
            password_hash=hash_password("admin"),
            role=UserRole.ADMIN,
            is_active=True,
        )
        session.add(admin)
        await session.commit()


async def _seed_audit_accounts() -> None:
    """Create default audit accounts (Martin, Anna, Hawa) if none exist."""
    from app.models.audit_account import AuditAccount

    async with async_session_factory() as session:
        result = await session.execute(select(AuditAccount).limit(1))
        if result.scalar_one_or_none() is not None:
            return

        defaults = [
            AuditAccount(name="Martin", description="Martin's account", initial_balance=0.0, is_default=True),
            AuditAccount(name="Anna", description="Anna's account", initial_balance=0.0, is_default=False),
            AuditAccount(name="Hawa", description="Hawa's account", initial_balance=0.0, is_default=False),
        ]
        session.add_all(defaults)
        await session.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
    settings.RECEIPTS_DIR.mkdir(parents=True, exist_ok=True)
    await init_db()
    await _seed_admin()
    await _seed_audit_accounts()
    await _fix_discount_format()
    await _fix_inventory_rollover()
    await _fix_phone_inventory_rollover()
    yield
    # Shutdown (nothing to clean up)


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all routers under /api/v1
API_PREFIX = "/api/v1"
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(sales.router, prefix=API_PREFIX)
app.include_router(inventory.router, prefix=API_PREFIX)
app.include_router(dashboard.router, prefix=API_PREFIX)
app.include_router(tyres.router, prefix=API_PREFIX)
app.include_router(payments.router, prefix=API_PREFIX)
app.include_router(losses.router, prefix=API_PREFIX)
app.include_router(sync.router, prefix=API_PREFIX)
app.include_router(settings_router.router, prefix=API_PREFIX)
app.include_router(phones.router, prefix=API_PREFIX)
app.include_router(phone_sales.router, prefix=API_PREFIX)
app.include_router(phone_inventory.router, prefix=API_PREFIX)
app.include_router(phone_losses.router, prefix=API_PREFIX)
app.include_router(phone_dashboard.router, prefix=API_PREFIX)
app.include_router(phone_sync.router, prefix=API_PREFIX)
app.include_router(stock_import.router, prefix=API_PREFIX)
app.include_router(audit.router, prefix=API_PREFIX)


@app.get("/health")
async def health_check() -> dict:
    return {"status": "ok", "version": settings.APP_VERSION}
