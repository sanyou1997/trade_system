"""Phone Excel-specific constants and layout configuration.

Phone inventory file structure:
- Sheet names: "1月" through "12月" (no "Tyre List_" prefix)
- Row 2: Cash Rate (B2), Row 3: Mukuru Rate (B3)
- Row 4: Headers
- Row 5+: Phone data
- FORMULA COLUMNS (1-indexed): {5, 7, 8, 9, 10} = E, G, H, I, J — NEVER OVERWRITE
"""

from typing import Final


# Formula columns that must NEVER be overwritten (1-indexed)
# E=5 (QTY remaining), G=7 (RMB), H=8 (CashPrice), I=9 (MukuruPrice), J=10 (OnlinePrice)
PHONE_FORMULA_COLUMNS: Final[frozenset[int]] = frozenset({5, 7, 8, 9, 10})

# Data row range
PHONE_DATA_START_ROW: Final[int] = 5   # Row 4 = headers, Row 5+ = data
PHONE_DATA_MAX_ROW: Final[int] = 100   # Generous upper bound; reader stops at empty rows

# Exchange rate cells
PHONE_CASH_RATE_ROW: Final[int] = 2
PHONE_CASH_RATE_COL: Final[int] = 2    # B2
PHONE_MUKURU_RATE_ROW: Final[int] = 3
PHONE_MUKURU_RATE_COL: Final[int] = 2  # B3

# Month sheet name: "N月" where 月 = \u6708
MONTH_CHAR: Final[str] = "\u6708"  # 月


def get_phone_sheet_name(month: int) -> str:
    """Get the phone sheet name for a given month number (1-12)."""
    return f"{month}{MONTH_CHAR}"


# Inventory column mappings (1-indexed)
PHONE_INV_BRAND_COL: Final[int] = 1     # A
PHONE_INV_MODEL_COL: Final[int] = 2     # B
PHONE_INV_CONFIG_COL: Final[int] = 3    # C
PHONE_INV_NOTE_COL: Final[int] = 4      # D
# E=5 QTY formula — SKIP
PHONE_INV_COST_COL: Final[int] = 6      # F
# G=7 RMB formula — SKIP
# H=8 CashPrice formula — SKIP
# I=9 MukuruPrice formula — SKIP
# J=10 OnlinePrice formula — SKIP
PHONE_INV_STATUS_COL: Final[int] = 11   # K

# Safe-to-write columns
PHONE_INV_INITIAL_COL: Final[int] = 13  # M
PHONE_INV_ADDED_COL: Final[int] = 14    # N
PHONE_INV_DAILY_START_COL: Final[int] = 15  # O (day 1)
PHONE_INV_DAILY_END_COL: Final[int] = 45   # AS (day 31)

# Read-only price columns (formula-derived, read with data_only=True)
PHONE_INV_CASH_PRICE_COL: Final[int] = 8    # H (CashPrice formula)
PHONE_INV_MUKURU_PRICE_COL: Final[int] = 9  # I (MukuruPrice formula)
PHONE_INV_ONLINE_PRICE_COL: Final[int] = 10 # J (OnlinePrice formula)


def phone_day_to_col(day: int) -> int:
    """Convert a day number (1-31) to column index."""
    if not 1 <= day <= 31:
        raise ValueError(f"Day must be 1-31, got {day}")
    return PHONE_INV_DAILY_START_COL + day - 1


# Invoice sheet names (same structure as tyre invoice)
PHONE_INVOICE_SALES_SHEET: Final[str] = "Sales Record"
PHONE_INVOICE_PAYMENTS_SHEET: Final[str] = "Payment Record"
PHONE_INVOICE_LOSS_SHEET: Final[str] = "Loss"
PHONE_INVOICE_STATS_SHEET: Final[str] = "Statistic"
PHONE_INVOICE_BROKEN_SHEET: Final[str] = "Broken Stock"

# Invoice Sales Record columns (1-indexed)
PHONE_INV_SALES_DATE_COL: Final[int] = 1      # A
PHONE_INV_SALES_BRAND_COL: Final[int] = 2     # B
PHONE_INV_SALES_MODEL_COL: Final[int] = 3     # C
PHONE_INV_SALES_CONFIG_COL: Final[int] = 4    # D
PHONE_INV_SALES_QTY_COL: Final[int] = 5       # E
PHONE_INV_SALES_PRICE_COL: Final[int] = 6     # F
PHONE_INV_SALES_DISCOUNT_COL: Final[int] = 7  # G
PHONE_INV_SALES_TOTAL_COL: Final[int] = 8     # H (formula: =E*F*(1-G))
PHONE_INV_SALES_PAYMENT_COL: Final[int] = 9   # I
PHONE_INV_SALES_CUSTOMER_COL: Final[int] = 10 # J

# Invoice Payment Record columns (same as tyre)
PHONE_INV_PAY_DATE_COL: Final[int] = 1    # A
PHONE_INV_PAY_CUSTOMER_COL: Final[int] = 2  # B
PHONE_INV_PAY_METHOD_COL: Final[int] = 3  # C
PHONE_INV_PAY_AMOUNT_COL: Final[int] = 4  # D

# Daily sales file structure (same as tyre daily)
PHONE_DAILY_HEADER_ROW: Final[int] = 2
PHONE_DAILY_DATA_START_ROW: Final[int] = 3
