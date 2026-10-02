"""Opaque sessions, password hashing and request authorization. No JWT storage in JS."""
from collections import OrderedDict, deque
from datetime import datetime, timezone
from hashlib import sha256
from secrets import compare_digest
from threading import Lock
from time import monotonic
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from fastapi import Depends, Request
from sqlalchemy.orm import Session
from app.config import get_settings
from app.database.session import get_db
from app.models import AuthSession, User
from app.api.simulation_validation import ApiProblem

COOKIE = "astra_session"
PASSWORDS = PasswordHasher()
DUMMY_HASH = PASSWORDS.hash("invalid-account-timing-placeholder")

def digest(token: str) -> str:
    return sha256(token.encode()).hexdigest()

def check_origin(request: Request):
    origin = request.headers.get("origin")
    if origin and origin not in get_settings().cors_origins:
        raise ApiProblem("forbidden", "Request origin is not allowed", [], 403)

def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE, "")
    session = db.get(AuthSession, digest(token)) if token and len(token) <= 100 else None
    if session is None or session.expires_at <= datetime.now(timezone.utc):
        raise ApiProblem("unauthorized", "Please sign in to continue", [], 401)
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        check_origin(request)
        if not compare_digest(request.headers.get("x-astra-csrf", "").encode(), session.csrf_token.encode()):
            raise ApiProblem("forbidden", "Session verification failed. Refresh and try again.", [], 403)
    user = db.get(User, session.user_id)
    if user is None:
        raise ApiProblem("unauthorized", "Please sign in to continue", [], 401)
    request.state.auth_session = session
    return user

def verify_password(encoded: str | None, password: str) -> bool:
    try:
        verified = PASSWORDS.verify(encoded or DUMMY_HASH, password)
        return bool(encoded and verified)
    except (VerificationError, InvalidHashError):
        return False

# Bounded single-process abuse protection; production ingress must also rate-limit.
_attempts = OrderedDict()
_lock = Lock()
def throttle(request: Request):
    now = monotonic()
    address = request.client.host if request.client else "unknown"
    with _lock:
        attempts = _attempts.setdefault(address, deque())
        while attempts and attempts[0] < now - 60: attempts.popleft()
        if len(attempts) >= 30:
            raise ApiProblem("rate_limited", "Too many sign-in attempts. Try again in a minute.", [], 429)
        attempts.append(now)
        _attempts.move_to_end(address)
        while len(_attempts) > 10000: _attempts.popitem(last=False)
