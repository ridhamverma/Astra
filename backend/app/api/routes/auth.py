"""Registration, login, current user and session revocation."""
from datetime import datetime, timedelta, timezone
from secrets import token_urlsafe
from uuid import UUID
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy import select, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.api.auth import COOKIE, PASSWORDS, check_origin, digest, get_current_user, throttle, verify_password
from app.api.simulation_validation import ApiProblem
from app.config import get_settings
from app.database.session import get_db
from app.models import AuthSession, User

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])
class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    @field_validator("email")
    @classmethod
    def normalize(cls, value): return str(value).strip().lower()
class Registration(Credentials):
    display_name: str = Field(min_length=1, max_length=200)
class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: str
    display_name: str | None
class AuthRead(BaseModel):
    user: UserRead
    csrf_token: str

def open_session(db, user, request, response):
    now = datetime.now(timezone.utc)
    old = request.cookies.get(COOKIE)
    if old: db.execute(delete(AuthSession).where(AuthSession.token_hash == digest(old)))
    db.execute(delete(AuthSession).where(AuthSession.expires_at <= now))
    token, csrf = token_urlsafe(32), token_urlsafe(32)
    settings = get_settings()
    db.add(AuthSession(token_hash=digest(token), user_id=user.id, csrf_token=csrf,
                       expires_at=now + timedelta(hours=settings.session_hours)))
    db.commit()
    response.set_cookie(COOKIE, token, max_age=settings.session_hours*3600, httponly=True,
                        secure=settings.cookie_secure, samesite=settings.cookie_samesite, path="/")

    response.headers["Cache-Control"] = "no-store"
    return AuthRead(user=UserRead.model_validate(user), csrf_token=csrf)

@router.post("/register", response_model=AuthRead, status_code=201)
def register(body: Registration, request: Request, response: Response, db: Session = Depends(get_db)):
    check_origin(request); throttle(request)
    user = User(email=body.email, display_name=body.display_name, password_hash=PASSWORDS.hash(body.password))
    db.add(user)
    try: db.flush()
    except IntegrityError:
        db.rollback()
        raise ApiProblem("conflict", "Registration could not be completed with this email", [], 409) from None
    return open_session(db, user, request, response)

@router.post("/login", response_model=AuthRead)
def login(body: Credentials, request: Request, response: Response, db: Session = Depends(get_db)):
    check_origin(request); throttle(request)
    user = db.scalar(select(User).where(User.email == body.email))
    if not verify_password(user.password_hash if user else None, body.password):
        raise ApiProblem("unauthorized", "Email or password is incorrect", [], 401)
    if PASSWORDS.check_needs_rehash(user.password_hash): user.password_hash = PASSWORDS.hash(body.password)
    return open_session(db, user, request, response)

@router.get("/me", response_model=AuthRead)
def current_user(request: Request, response: Response, user: User = Depends(get_current_user)):
    response.headers["Cache-Control"] = "no-store"
    return AuthRead(user=UserRead.model_validate(user), csrf_token=request.state.auth_session.csrf_token)

@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(request.state.auth_session); db.commit()
    settings = get_settings()
    response.delete_cookie(COOKIE, path="/", secure=settings.cookie_secure, httponly=True, samesite=settings.cookie_samesite)
    response.headers["Cache-Control"] = "no-store"

