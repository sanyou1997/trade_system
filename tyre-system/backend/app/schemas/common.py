from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    """Standard API response envelope."""

    success: bool
    data: T | None = None
    error: str | None = None
    meta: dict | None = None

    @classmethod
    def ok(cls, data: T, meta: dict | None = None) -> "ApiResponse[T]":
        return cls(success=True, data=data, meta=meta)

    @classmethod
    def fail(cls, error: str, meta: dict | None = None) -> "ApiResponse[None]":
        return cls(success=False, error=error, meta=meta)
