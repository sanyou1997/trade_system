import enum
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SyncDirection(str, enum.Enum):
    IMPORT = "import"
    EXPORT = "export"


class SyncStatus(str, enum.Enum):
    SUCCESS = "success"
    FAILED = "failed"


class SyncLog(Base):
    __tablename__ = "sync_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    direction: Mapped[SyncDirection] = mapped_column(
        Enum(SyncDirection),
        nullable=False,
    )
    status: Mapped[SyncStatus] = mapped_column(Enum(SyncStatus), nullable=False)
    records_processed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    file_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
