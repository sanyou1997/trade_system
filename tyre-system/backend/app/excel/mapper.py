"""Tyre mapping between database records and Excel rows.

Maps tyre SKUs (size + type + brand + pattern) to their Excel row numbers.
Handles size normalization (e.g., "185/65R15" vs "185/65/R15").
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from app.excel.reader import ExcelReader


def _normalize_size(size: str | None) -> str:
    """Normalize tyre size string for matching.

    Handles variations like:
    - "185/65R15" vs "185/65/R15" (missing slash before R)
    - Extra spaces, different cases

    Strategy: lowercase, strip, then insert "/" before "r" when it
    follows a digit and isn't already preceded by "/".
    E.g. "185/65R15" -> "185/65/r15", "185/65/R15" -> "185/65/r15"
    """
    if not size:
        return ""
    s = size.strip().lower().replace(" ", "")
    # Insert "/" before "r" when preceded by a digit without a slash
    # "185/65r15" -> "185/65/r15"  (already "185/65/r15" stays same)
    s = re.sub(r"(\d)(r)", r"\1/r", s)
    return s


def _normalize_str(value: str | None) -> str:
    """Normalize a string for comparison."""
    if not value:
        return ""
    return value.strip().lower()


class TyreMapper:
    """Maps tyre SKU attributes to Excel row numbers."""

    def __init__(self, tyres: list[dict]) -> None:
        """Initialize with a list of tyre dicts from ExcelReader.

        Each dict must have: row, size, type, brand, pattern.
        """
        self._tyres = tyres
        self._index: dict[str, int] = {}
        self._size_index: dict[str, list[dict]] = {}

        for tyre in tyres:
            key = self._make_key(
                tyre["size"], tyre["type"], tyre["brand"], tyre["pattern"]
            )
            self._index[key] = tyre["row"]

            norm_size = _normalize_size(tyre["size"])
            if norm_size not in self._size_index:
                self._size_index[norm_size] = []
            self._size_index[norm_size].append(tyre)

    @classmethod
    def from_file(cls, file_path: str | Path, month: int) -> "TyreMapper":
        """Build mapper from an inventory Excel file."""
        tyres = ExcelReader.read_inventory(file_path, month)
        return cls(tyres)

    @staticmethod
    def _make_key(
        size: str | None,
        type_: str | None,
        brand: str | None,
        pattern: str | None,
    ) -> str:
        """Create a normalized lookup key."""
        return "|".join([
            _normalize_size(size),
            _normalize_str(type_),
            _normalize_str(brand),
            _normalize_str(pattern),
        ])

    def match_tyre(
        self,
        size: str | None,
        type_: str | None,
        brand: str | None,
        pattern: str | None,
    ) -> int | None:
        """Find the Excel row for a tyre by exact attribute match.

        Returns the row number (1-indexed) or None if not found.
        """
        key = self._make_key(size, type_, brand, pattern)
        return self._index.get(key)

    def match_tyre_by_size(self, size: str | None) -> list[dict]:
        """Find all tyres matching a size (for fuzzy matching).

        Returns list of tyre dicts that match the normalized size.
        """
        norm = _normalize_size(size)
        return list(self._size_index.get(norm, []))

    def match_tyre_by_size_and_type(
        self,
        size: str | None,
        type_: str | None,
    ) -> int | None:
        """Find a tyre by size and type (fallback for when brand/pattern unknown).

        Returns the row number or None.
        """
        candidates = self.match_tyre_by_size(size)
        norm_type = _normalize_str(type_)

        for tyre in candidates:
            if _normalize_str(tyre["type"]) == norm_type:
                return tyre["row"]
        return None

    def match_tyre_fuzzy(
        self,
        size: str | None,
        type_: str | None,
        brand: str | None,
        pattern: str | None,
    ) -> int | None:
        """Try exact match first, then progressively fuzzy matching.

        Match order:
        1. Exact (size + type + brand + pattern)
        2. Size + type + brand (ignore pattern)
        3. Size + type (ignore brand and pattern)
        4. Size only (first match)

        Returns row number or None.
        """
        # 1. Exact match
        exact = self.match_tyre(size, type_, brand, pattern)
        if exact is not None:
            return exact

        # 2. Size + type + brand
        candidates = self.match_tyre_by_size(size)
        norm_type = _normalize_str(type_)
        norm_brand = _normalize_str(brand)

        for tyre in candidates:
            if (
                _normalize_str(tyre["type"]) == norm_type
                and _normalize_str(tyre["brand"]) == norm_brand
            ):
                return tyre["row"]

        # 3. Size + type
        result = self.match_tyre_by_size_and_type(size, type_)
        if result is not None:
            return result

        # 4. Size only (first match)
        if candidates:
            return candidates[0]["row"]

        return None

    def match_tyre_by_size_and_category(
        self,
        size: str | None,
        category: str | None,
    ) -> int | None:
        """Match using size and a simplified category string.

        category values from invoice: "new", "SecondHand", "Brandless"
        These map to inventory type: "New", "Second Hand",
        "New but Brandless"
        """
        norm_size = _normalize_size(size)
        norm_cat = _normalize_str(category)

        type_map: dict[str, str] = {
            "new": "new",
            "secondhand": "second hand",
            "second hand": "second hand",
            "brandless": "new but brandless",
            "new but brandless": "new but brandless",
        }
        target_type = type_map.get(norm_cat, norm_cat)

        candidates = self._size_index.get(norm_size, [])
        for tyre in candidates:
            if _normalize_str(tyre.get("type")) == target_type:
                return tyre["row"]

        return None

    @property
    def tyres(self) -> list[dict]:
        """Return all loaded tyres."""
        return list(self._tyres)
