from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    connect_args={"check_same_thread": False},
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an async database session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Create all tables, enable WAL mode, and run lightweight migrations."""
    from sqlalchemy import text

    from app.models import (  # noqa: F401 - ensure models are registered
        ExchangeRate,
        InventoryPeriod,
        Loss,
        Payment,
        Sale,
        Setting,
        SyncLog,
        Tyre,
        User,
    )
    from app.models.phone import Phone  # noqa: F401
    from app.models.phone_sale import PhoneSale  # noqa: F401
    from app.models.phone_inventory import PhoneInventoryPeriod  # noqa: F401
    from app.models.phone_loss import PhoneLoss  # noqa: F401
    from app.models.stock_import_log import StockImportLog  # noqa: F401
    from app.models.audit_account import AuditAccount  # noqa: F401
    from app.models.audit_transaction import AuditTransaction  # noqa: F401
    from app.models.audit_balance_override import AuditBalanceOverride  # noqa: F401
    from app.models.base import Base

    async with engine.begin() as conn:
        await conn.execute(text("PRAGMA journal_mode=WAL"))
        await conn.run_sync(Base.metadata.create_all)

        # Lightweight migrations for existing tables
        await _add_column_if_missing(
            conn,
            "payments",
            "product_type",
            "VARCHAR(20) NOT NULL DEFAULT 'tyre'",
        )


async def _add_column_if_missing(
    conn, table: str, column: str, column_def: str,
) -> None:
    """Add a column to an existing table if it doesn't exist yet (SQLite)."""
    from sqlalchemy import text

    result = await conn.execute(text(f"PRAGMA table_info({table})"))
    columns = [row[1] for row in result.fetchall()]
    if column not in columns:
        await conn.execute(
            text(f"ALTER TABLE {table} ADD COLUMN {column} {column_def}")
        )
