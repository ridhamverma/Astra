"""Starter catalogue and creation of ordinary owner-scoped editable projects."""
from typing import Annotated
from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, StringConstraints
from sqlalchemy.orm import Session
from app.api.auth import get_current_user
from app.api.routes.projects import create_project, _not_found
from app.database.session import get_db
from app.models import User
from app.schemas.projects import ProjectCreate, ProjectDetail
from app.templates import StarterTemplate, get_template, instantiate_template, list_templates

router = APIRouter(prefix="/api/v1/templates", tags=["templates"])
class TemplateProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)] | None = None

@router.get("", response_model=list[StarterTemplate])
def catalogue():
    return list_templates()

@router.post("/{template_id}/projects", response_model=ProjectDetail, status_code=201)
def create_from_template(template_id: str, payload: TemplateProjectCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        starter = get_template(template_id)
        model = instantiate_template(template_id, payload.name)
    except KeyError:
        raise _not_found("Template") from None
    return create_project(ProjectCreate(name=model.name, description=starter.description,
                                       model=model.model_dump(mode="json")), db, user)
