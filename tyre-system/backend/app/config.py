import os
from pathlib import Path


class Settings:
    """Application settings with environment variable overrides."""

    APP_NAME: str = "Tyre Sales & Inventory Management"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = os.getenv("DEBUG", "true").lower() == "true"

    # Paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    DATA_DIR: Path = BASE_DIR / "data"
    DB_PATH: Path = DATA_DIR / "tyre_system.db"
    # Local dev: Excel files in Tyres_Record (sibling to tyre-system)
    # Docker: overridden via EXCEL_DIR env var to /app/data/excel
    _DEFAULT_EXCEL_DIR: Path = BASE_DIR.parent / "Tyres_Record"
    EXCEL_DIR: Path = Path(os.getenv("EXCEL_DIR", str(_DEFAULT_EXCEL_DIR)))

    # Phone Excel paths
    # Inventory: D:\OneDrive\桌面\2024SP\
    # Invoice:   D:\OneDrive\桌面\2024SP\Sale Record\2025\
    # Daily:     D:\OneDrive\桌面\2024SP\Sale Record\销售表格\
    _DEFAULT_PHONE_EXCEL_DIR: Path = Path(
        os.getenv("PHONE_EXCEL_DIR_DEFAULT", r"D:\OneDrive\桌面\2024SP")
    )
    PHONE_EXCEL_DIR: Path = Path(
        os.getenv("PHONE_EXCEL_DIR", str(_DEFAULT_PHONE_EXCEL_DIR))
    )
    PHONE_INVOICE_DIR: Path = Path(os.getenv(
        "PHONE_INVOICE_DIR",
        str(_DEFAULT_PHONE_EXCEL_DIR / "Sale Record" / "2025"),
    ))
    PHONE_DAILY_DIR: Path = Path(os.getenv(
        "PHONE_DAILY_DIR",
        str(_DEFAULT_PHONE_EXCEL_DIR / "Sale Record" / "\u9500\u552e\u8868\u683c"),
    ))

    # Receipts
    RECEIPTS_DIR: Path = DATA_DIR / "receipts"

    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        f"sqlite+aiosqlite:///{DB_PATH}",
    )

    # Auth
    SESSION_SECRET: str = os.getenv("SESSION_SECRET", "dev-secret-change-in-prod")
    SESSION_COOKIE_NAME: str = "tyre_session"
    SESSION_MAX_AGE: int = 86400  # 24 hours

    # CORS
    ALLOWED_ORIGINS: list[str] = [
        o.strip()
        for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost").split(",")
        if o.strip()
    ]

    # Business constants
    PARTNER_SPLIT_PERCENT: float = 40.0
    SANYOU_SPLIT_PERCENT: float = 60.0
    DEFAULT_EXCHANGE_RATE: float = 590.0
    PAYMENT_METHODS: list[str] = ["Cash", "Mukuru", "Card"]
    LOW_STOCK_THRESHOLD: int = 5


settings = Settings()
