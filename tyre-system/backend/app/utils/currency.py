def mwk_to_cny(amount_mwk: float, rate: float) -> float:
    """Convert MWK amount to CNY using the given exchange rate."""
    if rate <= 0:
        return 0.0
    return round(amount_mwk / rate, 2)


def format_mwk(amount: float) -> str:
    """Format MWK amount for display, e.g. '3.7M MWK'."""
    millions = amount / 1_000_000
    if millions == 0:
        return "0M MWK"
    # Show one decimal place, strip trailing zero
    formatted = f"{millions:.1f}"
    if formatted.endswith(".0"):
        formatted = formatted[:-2]
    return f"{formatted}M MWK"
