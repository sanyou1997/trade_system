import hashlib
import secrets
import time

import bcrypt

from app.config import settings

# Simple in-memory session store. For production, use Redis or DB-backed sessions.
_sessions: dict[str, dict] = {}


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against a bcrypt hash."""
    return bcrypt.checkpw(
        password.encode("utf-8"),
        password_hash.encode("utf-8"),
    )


def create_session(user_id: int, username: str, role: str) -> str:
    """Create a new session and return the session token."""
    token = secrets.token_urlsafe(32)
    _sessions[token] = {
        "user_id": user_id,
        "username": username,
        "role": role,
        "created_at": time.time(),
    }
    return token


def validate_session(token: str) -> dict | None:
    """Validate a session token. Returns session data or None."""
    session = _sessions.get(token)
    if session is None:
        return None
    elapsed = time.time() - session["created_at"]
    if elapsed > settings.SESSION_MAX_AGE:
        _sessions.pop(token, None)
        return None
    return session


def destroy_session(token: str) -> None:
    """Remove a session by token."""
    _sessions.pop(token, None)
