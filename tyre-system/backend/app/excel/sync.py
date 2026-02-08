"""Excel synchronization manager.

Coordinates reading from and writing to Excel files,
with conflict detection via file hashing.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path

from app.excel.mapper import TyreMapper
from app.excel.reader import ExcelReader
from app.excel.writer import ExcelWriter


@dataclass(frozen=True)
class SyncResult:
    """Result of a sync operation."""

    success: bool
    records_processed: int = 0
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class SyncManager:
    """Manages synchronization between the database and Excel files."""

    @staticmethod
    def compute_file_hash(file_path: str | Path) -> str:
        """Compute SHA-256 hash of a file for conflict detection."""
        sha256 = hashlib.sha256()
        with open(str(file_path), "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256.update(chunk)
        return sha256.hexdigest()

    @staticmethod
    def sync_to_inventory(
        file_path: str | Path,
        month: int,
        sales_by_day: dict[int, list[dict]],
    ) -> SyncResult:
        """Write daily sales to the inventory Excel file.

        Args:
            file_path: Path to inventory Excel file.
            month: Month number (1-12).
            sales_by_day: Dict mapping day number to list of
                dicts with 'row' and 'qty' keys.

        Returns:
            SyncResult with success status and counts.
        """
        errors: list[str] = []
        warnings: list[str] = []
        total_records = 0

        for day, sales in sorted(sales_by_day.items()):
            try:
                ExcelWriter.write_daily_sales(file_path, month, day, sales)
                total_records += len(sales)
            except ValueError as e:
                errors.append(f"Day {day}: {e}")
            except Exception as e:
                errors.append(f"Day {day}: Unexpected error: {e}")

        return SyncResult(
            success=len(errors) == 0,
            records_processed=total_records,
            errors=errors,
            warnings=warnings,
        )

    @staticmethod
    def sync_to_invoice(
        file_path: str | Path,
        sales: list[dict] | None = None,
        payments: list[dict] | None = None,
    ) -> SyncResult:
        """Write sales and payments to the invoice Excel file.

        Args:
            file_path: Path to invoice Excel file.
            sales: List of sale dicts to append.
            payments: List of payment dicts to append.

        Returns:
            SyncResult with success status and counts.
        """
        errors: list[str] = []
        total_records = 0

        for sale in (sales or []):
            try:
                ExcelWriter.append_invoice_sale(file_path, sale)
                total_records += 1
            except Exception as e:
                errors.append(f"Sale error: {e}")

        for payment in (payments or []):
            try:
                ExcelWriter.append_invoice_payment(file_path, payment)
                total_records += 1
            except Exception as e:
                errors.append(f"Payment error: {e}")

        return SyncResult(
            success=len(errors) == 0,
            records_processed=total_records,
            errors=errors,
        )

    @staticmethod
    def import_from_inventory(
        file_path: str | Path,
        month: int,
    ) -> dict:
        """Import tyre data and exchange rate from inventory Excel.

        Returns dict with keys: tyres (list[dict]), exchange_rate (float).
        """
        tyres = ExcelReader.read_inventory(file_path, month)
        exchange_rate = ExcelReader.read_exchange_rate(file_path, month)
        return {
            "tyres": tyres,
            "exchange_rate": exchange_rate,
        }

    @staticmethod
    def import_from_invoice(file_path: str | Path) -> dict:
        """Import all data from an invoice Excel file.

        Auto-detects old format (Cash/Mukuru sheets) vs new format
        (Sales Record/Payment Record sheets).

        Returns dict with keys: sales, payments, losses, statistics, format.
        """
        fmt = ExcelReader.detect_invoice_format(file_path)

        if fmt == "old":
            sales = ExcelReader.read_invoice_sales_old(file_path)
            payments = ExcelReader.read_invoice_payments_old(file_path)
        else:
            sales = ExcelReader.read_invoice_sales(file_path)
            payments = ExcelReader.read_invoice_payments(file_path)

        # Loss and Statistic sheets have the same structure in both formats
        losses = ExcelReader.read_invoice_losses(file_path)
        statistics = ExcelReader.read_invoice_statistics(file_path)
        return {
            "sales": sales,
            "payments": payments,
            "losses": losses,
            "statistics": statistics,
            "format": fmt,
        }

    @staticmethod
    def import_from_daily_sales(file_path: str | Path) -> dict:
        """Import data from a daily sales file.

        Returns dict with keys: sales, payments.
        """
        sales = ExcelReader.read_daily_sales(file_path)
        payments = ExcelReader.read_daily_payments(file_path)
        return {
            "sales": sales,
            "payments": payments,
        }

    @staticmethod
    def build_mapper(
        file_path: str | Path,
        month: int,
    ) -> TyreMapper:
        """Build a tyre mapper from the inventory file."""
        return TyreMapper.from_file(file_path, month)
