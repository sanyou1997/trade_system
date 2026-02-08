"""Phone Excel synchronization manager.

Coordinates reading from and writing to phone Excel files.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path

from app.excel.phone_mapper import PhoneMapper
from app.excel.phone_reader import PhoneExcelReader
from app.excel.phone_writer import PhoneExcelWriter


@dataclass(frozen=True)
class PhoneSyncResult:
    """Result of a phone sync operation."""

    success: bool
    records_processed: int = 0
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class PhoneSyncManager:
    """Manages synchronization between the database and phone Excel files."""

    @staticmethod
    def compute_file_hash(file_path: str | Path) -> str:
        """Compute SHA-256 hash of a file for conflict detection."""
        sha256 = hashlib.sha256()
        with open(str(file_path), "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256.update(chunk)
        return sha256.hexdigest()

    @staticmethod
    def import_from_inventory(
        file_path: str | Path,
        month: int,
    ) -> dict:
        """Import phone data and exchange rates from inventory Excel.

        Returns dict with keys: phones (list[dict]),
        cash_rate (float), mukuru_rate (float).
        """
        phones = PhoneExcelReader.read_inventory(file_path, month)
        rates = PhoneExcelReader.read_exchange_rates(file_path, month)
        return {
            "phones": phones,
            "cash_rate": rates["cash_rate"],
            "mukuru_rate": rates["mukuru_rate"],
        }

    @staticmethod
    def import_from_invoice(file_path: str | Path) -> dict:
        """Import all data from a phone invoice Excel file.

        Returns dict with keys: sales, payments, losses, statistics.
        """
        sales = PhoneExcelReader.read_invoice_sales(file_path)
        payments = PhoneExcelReader.read_invoice_payments(file_path)
        losses = PhoneExcelReader.read_invoice_losses(file_path)
        statistics = PhoneExcelReader.read_invoice_statistics(file_path)
        return {
            "sales": sales,
            "payments": payments,
            "losses": losses,
            "statistics": statistics,
        }

    @staticmethod
    def import_from_daily_sales(file_path: str | Path) -> dict:
        """Import data from a daily phone sales file.

        Returns dict with keys: sales, payments.
        """
        sales = PhoneExcelReader.read_daily_sales(file_path)
        payments = PhoneExcelReader.read_daily_payments(file_path)
        return {
            "sales": sales,
            "payments": payments,
        }

    @staticmethod
    def build_mapper(
        file_path: str | Path,
        month: int,
    ) -> PhoneMapper:
        """Build a phone mapper from the inventory file."""
        return PhoneMapper.from_file(file_path, month)
