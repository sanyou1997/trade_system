"""Excel-specific constants and layout configuration.

The inventory file has TWO different column layouts:
- NEW layout (months 1, 11, 12): exchange rate in I54, M=Initial, N=Add, O-AS=days
- OLD layout (months 8, 9, 10): exchange rate in M2, M=Rate, N=Initial, O=Add, P-AT=days
"""

from dataclasses import dataclass
from typing import Final


# Formula columns that must NEVER be overwritten (1-indexed)
# G=7 (After Delivery&Duty COST), H=8 (QTY), I=9 (Suggested Price),
# J=10 (=I/450/7), K=11 (Total Sold)
FORMULA_COLUMNS: Final[frozenset[int]] = frozenset({7, 8, 9, 10, 11})

# Data row range (row 1 = headers)
DATA_START_ROW: Final[int] = 2
# Rows 2-46 = individual tyres, row 47 = "Total",
# rows 48-50 = extras (brandless), row 51 = "Total Tyre Available"
DATA_END_ROW: Final[int] = 51

# Exchange rate cell in I54 (new layout)
EXCHANGE_RATE_ROW: Final[int] = 54
EXCHANGE_RATE_COL: Final[int] = 9  # Column I

# Month sheet name: "Tyre List_N月" where 月 = \u6708
MONTH_CHAR: Final[str] = "\u6708"  # 月


def get_sheet_name(month: int) -> str:
    """Get the sheet name for a given month number (1-12)."""
    return f"Tyre List_{month}{MONTH_CHAR}"


# Months that use the OLD layout (rate in M2)
OLD_LAYOUT_MONTHS: Final[frozenset[int]] = frozenset({8, 9, 10})


@dataclass(frozen=True)
class SheetLayout:
    """Column layout for inventory sheets."""

    exchange_rate_row: int
    exchange_rate_col: int
    initial_stock_col: int  # M or N
    added_stock_col: int    # N or O
    daily_start_col: int    # O or P (day 1)
    daily_end_col: int      # AS or AT (day 31)

    def day_to_col(self, day: int) -> int:
        """Convert a day number (1-31) to column index."""
        if not 1 <= day <= 31:
            raise ValueError(f"Day must be 1-31, got {day}")
        return self.daily_start_col + day - 1


# NEW layout: months 1, 11, 12 (and presumably future months)
# M=13 (Initial), N=14 (Add), O=15 through AS=45 (days 1-31)
NEW_LAYOUT: Final[SheetLayout] = SheetLayout(
    exchange_rate_row=54,
    exchange_rate_col=9,   # I54
    initial_stock_col=13,  # M
    added_stock_col=14,    # N
    daily_start_col=15,    # O (day 1)
    daily_end_col=45,      # AS (day 31)
)

# OLD layout: months 8, 9, 10
# M=13 (Rate), N=14 (Initial), O=15 (Add), P=16 through AT=46 (days 1-31)
OLD_LAYOUT: Final[SheetLayout] = SheetLayout(
    exchange_rate_row=2,
    exchange_rate_col=13,  # M2
    initial_stock_col=14,  # N
    added_stock_col=15,    # O
    daily_start_col=16,    # P (day 1)
    daily_end_col=46,      # AT (day 31)
)


def get_layout(month: int) -> SheetLayout:
    """Get the correct layout for a given month."""
    if month in OLD_LAYOUT_MONTHS:
        return OLD_LAYOUT
    return NEW_LAYOUT


# Invoice sheet names -- NEW format (2026+)
INVOICE_SALES_SHEET: Final[str] = "Sales Record"
INVOICE_PAYMENTS_SHEET: Final[str] = "Payment Record"
INVOICE_LOSS_SHEET: Final[str] = "Loss"
INVOICE_STATS_SHEET: Final[str] = "Statistic"
INVOICE_BROKEN_SHEET: Final[str] = "Broken Stock"

# Invoice sheet names -- OLD format (2025 and earlier)
# Sales split by payment method into separate sheets
INVOICE_OLD_CASH_SHEET: Final[str] = "Cash"
INVOICE_OLD_MUKURU_SHEET: Final[str] = "Mukuru"

# OLD format Cash sheet columns (row 1=merged header, row 2=headers, row 3+=data)
# A=Date, B=Size, C=Type, D=Brand, E=Qty, F=UnitPrice, G=Total, H=Note, I=Customer
OLD_CASH_DATE_COL: Final[int] = 1
OLD_CASH_SIZE_COL: Final[int] = 2
OLD_CASH_TYPE_COL: Final[int] = 3
OLD_CASH_BRAND_COL: Final[int] = 4
OLD_CASH_QTY_COL: Final[int] = 5
OLD_CASH_PRICE_COL: Final[int] = 6
OLD_CASH_TOTAL_COL: Final[int] = 7
OLD_CASH_NOTE_COL: Final[int] = 8   # discount stored here (e.g. -0.05)
OLD_CASH_CUSTOMER_COL: Final[int] = 9
OLD_CASH_DATA_START_ROW: Final[int] = 3

# OLD format Mukuru sheet columns (row 1=merged header, row 2=headers, row 3+=data)
# A=Date, B=Brand, C=Model, D=Config(=Size), E=Qty, F=UnitPrice, G=Total, H=Customer
OLD_MUKURU_DATE_COL: Final[int] = 1
OLD_MUKURU_BRAND_COL: Final[int] = 2
OLD_MUKURU_TYPE_COL: Final[int] = 3   # "Model"
OLD_MUKURU_SIZE_COL: Final[int] = 4   # "Config"
OLD_MUKURU_QTY_COL: Final[int] = 5
OLD_MUKURU_PRICE_COL: Final[int] = 6
OLD_MUKURU_TOTAL_COL: Final[int] = 7
OLD_MUKURU_CUSTOMER_COL: Final[int] = 8
OLD_MUKURU_DATA_START_ROW: Final[int] = 3

# OLD format payment sub-section columns (embedded in Cash/Mukuru sheets)
# A=Date, B=Customer, C=TransactionNo, D=MWK
OLD_PAY_DATE_COL: Final[int] = 1
OLD_PAY_CUSTOMER_COL: Final[int] = 2
OLD_PAY_AMOUNT_COL: Final[int] = 4  # D=MWK

# Invoice Sales Record columns (1-indexed)
INV_SALES_DATE_COL: Final[int] = 1      # A
INV_SALES_BRAND_COL: Final[int] = 2     # B
INV_SALES_TYPE_COL: Final[int] = 3      # C
INV_SALES_SIZE_COL: Final[int] = 4      # D
INV_SALES_QTY_COL: Final[int] = 5       # E
INV_SALES_PRICE_COL: Final[int] = 6     # F
INV_SALES_DISCOUNT_COL: Final[int] = 7  # G
INV_SALES_TOTAL_COL: Final[int] = 8     # H (formula: =E*F*(1-G))
INV_SALES_PAYMENT_COL: Final[int] = 9   # I
INV_SALES_CUSTOMER_COL: Final[int] = 10 # J

# Invoice Payment Record columns
INV_PAY_DATE_COL: Final[int] = 1    # A
INV_PAY_CUSTOMER_COL: Final[int] = 2  # B
INV_PAY_METHOD_COL: Final[int] = 3  # C
INV_PAY_AMOUNT_COL: Final[int] = 4  # D

# Invoice Statistic sheet
# Row 2: Total, Sold, Historic Broken, Loss this Month, Remain, ..., Mukuru Rate, <value>
# Row 3: ..., Cash Rate, <value>
STATS_MUKURU_RATE_ROW: Final[int] = 2
STATS_CASH_RATE_ROW: Final[int] = 3
STATS_RATE_COL: Final[int] = 9  # Column I

# Inventory file header columns (1-indexed, for reference)
INV_SIZE_COL: Final[int] = 1       # A
INV_TYPE_COL: Final[int] = 2       # B
INV_BRAND_COL: Final[int] = 3      # C
INV_PATTERN_COL: Final[int] = 4    # D
INV_LISR_COL: Final[int] = 5       # E
INV_COST_COL: Final[int] = 6       # F
INV_ORIG_PRICE_COL: Final[int] = 12     # L (Original Price)
INV_SUGGESTED_PRICE_COL: Final[int] = 9  # I (Suggested Price, formula column)

# Daily sales file structure
DAILY_HEADER_ROW: Final[int] = 2    # Row 2 has column headers
DAILY_DATA_START_ROW: Final[int] = 3  # Row 3+ has data
