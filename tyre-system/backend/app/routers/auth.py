from fastapi import APIRouter, Cookie, Depends, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.user import LoginRequest, UserResponse
from app.utils.auth import (
    create_session,
    destroy_session,
    validate_session,
    verify_password,
)
from app.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    tyre_session: str | None = Cookie(None),
) -> User:
    """Dependency that returns the current authenticated user."""
    if tyre_session is None:
        raise _unauthorized()

    session_data = validate_session(tyre_session)
    if session_data is None:
        raise _unauthorized()

    result = await db.execute(
        select(User).where(User.id == session_data["user_id"], User.is_active.is_(True))
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise _unauthorized()
    return user


def _unauthorized():
    from fastapi import HTTPException
    return HTTPException(status_code=401, detail="Not authenticated")


@router.post("/login")
async def login(
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[UserResponse]:
    result = await db.execute(
        select(User).where(User.username == body.username)
    )
    user = result.scalar_one_or_none()

    if user is None or not verify_password(body.password, user.password_hash):
        return ApiResponse.fail("Invalid username or password")

    if not user.is_active:
        return ApiResponse.fail("Account is disabled")

    token = create_session(user.id, user.username, user.role.value)
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=token,
        max_age=settings.SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
    )

    return ApiResponse.ok(UserResponse.model_validate(user))


@router.post("/logout")
async def logout(
    response: Response,
    tyre_session: str | None = Cookie(None),
) -> ApiResponse[None]:
    if tyre_session:
        destroy_session(tyre_session)
    response.delete_cookie(key=settings.SESSION_COOKIE_NAME)
    return ApiResponse.ok(None)


@router.get("/me")
async def get_me(
    user: User = Depends(get_current_user),
) -> ApiResponse[UserResponse]:
    return ApiResponse.ok(UserResponse.model_validate(user))
