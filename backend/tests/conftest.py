"""Existing domain/API tests explicitly stub authentication; storage/auth tests use real sessions."""
from uuid import uuid4
import pytest
from app.api.auth import get_current_user, _attempts
from app.models import User

@pytest.fixture(autouse=True)
def existing_unit_auth_context(request, monkeypatch):
    _attempts.clear()
    if request.module.__name__ not in {"test_simulation_api", "test_ai_generation", "test_ai_explanation", "test_optimization", "test_bottlenecks"}:
        yield; return
    def authenticated(): return User(id=uuid4(), email="unit@example.com", display_name="Unit test")
    original = getattr(request.module, "create_app", None)
    if original:
        def factory(*args, **kwargs):
            app = original(*args, **kwargs)
            app.dependency_overrides[get_current_user] = authenticated
            return app
        monkeypatch.setattr(request.module, "create_app", factory)
    app = getattr(request.module, "app", None)
    if app: app.dependency_overrides[get_current_user] = authenticated
    yield
    if app: app.dependency_overrides.pop(get_current_user, None)
