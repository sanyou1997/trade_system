_MONTH_NAMES = [
    "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]


def get_month_name(month: int) -> str:
    """Return abbreviated month name (1-indexed). E.g. 1 -> 'Jan'."""
    if 1 <= month <= 12:
        return _MONTH_NAMES[month]
    raise ValueError(f"Invalid month: {month}")


def get_day_suffix(day: int) -> str:
    """Return day with suffix matching the WeChat format. E.g. 22 -> '22th'.

    Note: The WeChat format uses 'th' for all days, which is intentional
    to match the existing business communication style.
    """
    return f"{day}th"
