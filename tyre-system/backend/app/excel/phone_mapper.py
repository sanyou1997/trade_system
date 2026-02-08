"""Phone mapping between database records and Excel rows.

Maps phone SKUs (brand + model + config) to their Excel row numbers.
"""

from __future__ import annotations

from pathlib import Path

from app.excel.phone_reader import PhoneExcelReader


def _normalize(value: str | None) -> str:
    """Normalize a string for comparison."""
    if not value:
        return ""
    return value.strip().lower()


class PhoneMapper:
    """Maps phone SKU attributes to Excel row numbers."""

    def __init__(self, phones: list[dict]) -> None:
        """Initialize with a list of phone dicts from PhoneExcelReader.

        Each dict must have: row, brand, model, config.
        """
        self._phones = phones
        self._index: dict[str, int] = {}
        self._brand_model_index: dict[str, list[dict]] = {}

        for phone in phones:
            key = self._make_key(phone["brand"], phone["model"], phone["config"])
            self._index[key] = phone["row"]

            bm_key = f"{_normalize(phone['brand'])}|{_normalize(phone['model'])}"
            if bm_key not in self._brand_model_index:
                self._brand_model_index[bm_key] = []
            self._brand_model_index[bm_key].append(phone)

    @classmethod
    def from_file(cls, file_path: str | Path, month: int) -> "PhoneMapper":
        """Build mapper from a phone inventory Excel file."""
        phones = PhoneExcelReader.read_inventory(file_path, month)
        return cls(phones)

    @staticmethod
    def _make_key(
        brand: str | None,
        model: str | None,
        config: str | None,
    ) -> str:
        """Create a normalized lookup key."""
        return "|".join([
            _normalize(brand),
            _normalize(model),
            _normalize(config),
        ])

    def match_phone(
        self,
        brand: str | None,
        model: str | None,
        config: str | None,
    ) -> int | None:
        """Find the Excel row for a phone by exact attribute match.

        Returns the row number (1-indexed) or None if not found.
        """
        key = self._make_key(brand, model, config)
        return self._index.get(key)

    def match_phone_fuzzy(
        self,
        brand: str | None,
        model: str | None,
        config: str | None,
    ) -> int | None:
        """Try exact match first, then progressively fuzzy matching.

        Match order:
        1. Exact (brand + model + config)
        2. Brand + model (ignore config, first match)

        Returns row number or None.
        """
        # 1. Exact match
        exact = self.match_phone(brand, model, config)
        if exact is not None:
            return exact

        # 2. Brand + model
        bm_key = f"{_normalize(brand)}|{_normalize(model)}"
        candidates = self._brand_model_index.get(bm_key, [])
        if candidates:
            return candidates[0]["row"]

        return None

    @property
    def phones(self) -> list[dict]:
        """Return all loaded phones."""
        return list(self._phones)
