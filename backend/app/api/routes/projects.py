"""Project model versioning and persistent, compact simulation history."""

from datetime import datetime, timezone
from uuid import UUID

from pydantic import TypeAdapter
from fastapi import APIRouter, Depends, status
from sqlalchemy import delete, select, func
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.api.schemas import ApiIssue
from app.api.simulation_validation import ApiProblem, validate_request_payload
from app.database.session import get_db
from app.models import Project, SimulationModelVersion, SimulationRun, User
from app.schemas.projects import ProjectCreate, ProjectDetail, ProjectSummary, ProjectUpdate, RunCreate, RunRead, RunPlayback
from app.schemas.simulation import SimulationModel
from app.simulation import SimulationLimitError, simulate
from app.simulation.bottlenecks import analyze_bottlenecks
from app.simulation.results import ProcessMetrics, QueueMetrics

METRICS_ADAPTER = TypeAdapter(dict[str, ProcessMetrics | QueueMetrics])

router = APIRouter(prefix="/api/v1", tags=["projects"])


def _not_found(kind: str) -> ApiProblem:
    return ApiProblem("not_found", f"{kind} not found", [], status_code=404)


def _project(db: Session, project_id: UUID, user_id: UUID, *, lock: bool = False) -> Project:
    query = select(Project).where(Project.id == project_id, Project.user_id == user_id)
    if lock:
        query = query.with_for_update()
    project = db.scalar(query)
    if project is None:
        raise _not_found("Project")
    return project


def _latest(db: Session, project_id: UUID) -> SimulationModelVersion | None:
    return db.scalar(
        select(SimulationModelVersion)
        .where(SimulationModelVersion.project_id == project_id)
        .order_by(SimulationModelVersion.version.desc())
        .limit(1)
    )


def _project_read(db: Session, project: Project) -> ProjectDetail:
    latest = _latest(db, project.id)
    runs = db.execute(select(func.count(SimulationRun.id), func.max(SimulationRun.created_at)).where(SimulationRun.project_id == project.id)).one()
    has_current_run = latest is not None and db.scalar(select(SimulationRun.id).where(
        SimulationRun.project_id == project.id, SimulationRun.version == latest.version,
        SimulationRun.scenario_id.is_(None),
    ).limit(1)) is not None
    return ProjectDetail(
        id=project.id,
        name=project.name,
        description=project.description,
        user_id=project.user_id,
        latest_version=latest.version if latest else None,
        model=latest.graph if latest else None,
        created_at=project.created_at,
        updated_at=project.updated_at,
        last_accessed_at=project.last_accessed_at,
        run_count=runs[0],
        last_run_at=runs[1],
        status="completed" if has_current_run else "needs_review",
    )


def _save_model(db: Session, project: Project, model: SimulationModel) -> SimulationModelVersion:
    latest = _latest(db, project.id)
    version = SimulationModelVersion(
        project_id=project.id,
        version=1 if latest is None else latest.version + 1,
        graph=model.model_dump(mode="json"),
    )
    db.add(version)
    project.updated_at = datetime.now(timezone.utc)
    db.flush()
    return version


def _run_read(db: Session, run: SimulationRun) -> RunRead:
    # Recompute from immutable saved graph + measured compact metrics. This also
    # makes pre-Phase-13 runs analyzable without migrations or another simulation.
    version = db.scalars(select(SimulationModelVersion).where(
        SimulationModelVersion.project_id == run.project_id,
        SimulationModelVersion.version == run.version,
    )).one()
    model = SimulationModel.model_validate(version.graph)
    metrics = METRICS_ADAPTER.validate_python(run.node_metrics)
    return RunRead(
        id=run.id,
        scenario_id=run.scenario_id,
        project_id=run.project_id,
        model_version=run.version,
        seed=run.seed,
        duration=run.duration,
        summary=run.summary,
        node_metrics=metrics,
        bottleneck_analysis=analyze_bottlenecks(model, metrics),
        time_series=run.time_series,
        created_at=run.created_at,
    )


@router.get("/projects", response_model=list[ProjectSummary])
def list_projects(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[ProjectSummary]:
    projects = db.scalars(select(Project).where(Project.user_id == user.id).order_by(Project.created_at.desc(), Project.id)).all()
    if not projects:
        return []
    ids = [project.id for project in projects]
    # Batch library data rather than loading full run histories per card.
    latest_numbers = select(SimulationModelVersion.project_id, func.max(SimulationModelVersion.version).label("version")).where(
        SimulationModelVersion.project_id.in_(ids),
    ).group_by(SimulationModelVersion.project_id).subquery()
    versions = db.scalars(select(SimulationModelVersion).join(latest_numbers, (
        (SimulationModelVersion.project_id == latest_numbers.c.project_id) &
        (SimulationModelVersion.version == latest_numbers.c.version)
    ))).all()
    latest = {}
    for version in versions:
        latest.setdefault(version.project_id, version)
    activity = {row[0]: row[1:] for row in db.execute(select(
        SimulationRun.project_id, func.count(SimulationRun.id), func.max(SimulationRun.created_at),
    ).where(SimulationRun.project_id.in_(ids)).group_by(SimulationRun.project_id))}
    completed_versions = set(db.execute(select(SimulationRun.project_id, SimulationRun.version).where(
        SimulationRun.project_id.in_(ids), SimulationRun.scenario_id.is_(None),
    ).distinct()).all())
    return [ProjectSummary(
        id=project.id, name=project.name, description=project.description, user_id=project.user_id,
        created_at=project.created_at, updated_at=project.updated_at, last_accessed_at=project.last_accessed_at,
        latest_version=latest[project.id].version if project.id in latest else None,
        model=latest[project.id].graph if project.id in latest else None,
        run_count=activity.get(project.id, (0, None))[0], last_run_at=activity.get(project.id, (0, None))[1],
        status="completed" if project.id in latest and (project.id, latest[project.id].version) in completed_versions else "needs_review",
    ) for project in projects]


@router.post("/projects/{project_id}/access", status_code=status.HTTP_204_NO_CONTENT)
def record_project_access(project_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> None:
    project = _project(db, project_id, user.id)
    # SQLAlchemy's onupdate must not turn an open into a model edit.
    db.execute(Project.__table__.update().where(Project.id == project.id).values(
        last_accessed_at=datetime.now(timezone.utc), updated_at=project.updated_at,
    ))
    db.commit()


@router.post("/projects", response_model=ProjectDetail, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> ProjectDetail:
    model = validate_request_payload(payload.model) if payload.model is not None else None
    project = Project(name=payload.name, description=payload.description, user_id=user.id)
    db.add(project)
    db.flush()
    if model is not None:
        _save_model(db, project, model)
    db.commit()
    return _project_read(db, project)


@router.get("/projects/{project_id}", response_model=ProjectDetail)
def get_project(project_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> ProjectDetail:
    return _project_read(db, _project(db, project_id, user.id))


@router.put("/projects/{project_id}", response_model=ProjectDetail)
def update_project(project_id: UUID, payload: ProjectUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> ProjectDetail:
    changes = payload.model_fields_set
    if "name" in changes and payload.name is None:
        raise ApiProblem("invalid_configuration", "Project name cannot be null", [ApiIssue(code="invalid_configuration", path="name", message="Provide a project name")])
    if "model" in changes and payload.model is None:
        raise ApiProblem("invalid_configuration", "Model cannot be null", [ApiIssue(code="invalid_configuration", path="model", message="Provide an Astra model")])
    model = validate_request_payload(payload.model) if "model" in changes else None
    project = _project(db, project_id, user.id, lock=True)
    if "name" in changes:
        project.name = payload.name
    if "description" in changes:
        project.description = payload.description
    if model is not None:
        _save_model(db, project, model)
    elif changes:
        project.updated_at = datetime.now(timezone.utc)
    db.commit()
    return _project_read(db, project)


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> None:
    _project(db, project_id, user.id)
    db.execute(delete(Project).where(Project.id == project_id))
    db.commit()


@router.post("/projects/{project_id}/runs", response_model=RunPlayback | RunRead, status_code=status.HTTP_201_CREATED)
def create_run(project_id: UUID, payload: RunCreate | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> RunRead | RunPlayback:
    _project(db, project_id, user.id)
    requested_version = payload.model_version if payload else None
    if requested_version is None:
        version = _latest(db, project_id)
    else:
        version = db.scalar(
            select(SimulationModelVersion).where(
                SimulationModelVersion.project_id == project_id,
                SimulationModelVersion.version == requested_version,
            )
        )
    if version is None:
        raise _not_found("Model version")
    return _execute_run(db, version, include_timeline=bool(payload and payload.include_timeline))


def _execute_run(db: Session, version: SimulationModelVersion, *, include_timeline: bool = False, scenario_id: UUID | None = None) -> RunRead | RunPlayback:
    """Shared project/scenario execution; simulation stays independent of storage."""
    model = validate_request_payload(version.graph)
    try:
        result = simulate(model)
    except SimulationLimitError as error:
        raise ApiProblem("failed_simulation", "Simulation exceeded a safety limit", [ApiIssue(code="failed_simulation", path="model", message=str(error))]) from None
    run = SimulationRun(
        project_id=version.project_id,
        scenario_id=scenario_id,
        version=version.version,
        seed=model.simulation.seed,
        duration=model.simulation.duration,
        summary=result.summary.model_dump(mode="json"),
        node_metrics={key: value.model_dump(mode="json") for key, value in result.node_metrics.items()},
        time_series=result.time_series.model_dump(mode="json"),
    )
    db.add(run)
    db.commit()
    if include_timeline:
        return RunPlayback(**_run_read(db, run).model_dump(), model=model, events=result.events)
    return _run_read(db, run)


@router.get("/projects/{project_id}/runs", response_model=list[RunRead])
def list_runs(project_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[RunRead]:
    _project(db, project_id, user.id)
    runs = db.scalars(select(SimulationRun).where(SimulationRun.project_id == project_id).order_by(SimulationRun.created_at.desc(), SimulationRun.id)).all()
    return [_run_read(db, run) for run in runs]


@router.get("/runs/{run_id}", response_model=RunRead)
def get_run(run_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> RunRead:
    run = db.scalar(select(SimulationRun).join(Project, Project.id == SimulationRun.project_id).where(SimulationRun.id == run_id, Project.user_id == user.id))
    if run is None:
        raise _not_found("Run")
    return _run_read(db, run)
