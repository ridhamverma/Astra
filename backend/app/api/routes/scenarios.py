"""Named immutable model versions, execution, and controlled scenario comparison."""
from uuid import UUID
from fastapi import APIRouter, Depends, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from app.api.routes.projects import _execute_run, _not_found, _project, _run_read, _save_model
from app.api.simulation_validation import ApiProblem, validate_request_payload
from app.api.auth import get_current_user
from app.database.session import get_db
from app.models import Scenario, SimulationModelVersion, SimulationRun, Project, User
from app.schemas.projects import RunCreate, RunPlayback, RunRead
from app.schemas.scenarios import ComparisonRequest, ScenarioComparison, ScenarioCreate, ScenarioDuplicate, ScenarioRead, ScenarioUpdate
from app.simulation.comparison import metric_difference

router = APIRouter(prefix="/api/v1", tags=["scenarios"])


def _scenario(db: Session, scenario_id: UUID, user_id: UUID) -> Scenario:
    scenario = db.scalar(select(Scenario).join(Project, Project.id == Scenario.project_id).where(Scenario.id == scenario_id, Project.user_id == user_id))
    if scenario is None:
        raise _not_found("Scenario")
    return scenario


def _locked_scenario(db: Session, scenario_id: UUID, user_id: UUID):
    initial = _scenario(db, scenario_id, user_id)
    project = _project(db, initial.project_id, user_id, lock=True)
    # An edit/delete in another tab may finish while we wait for the project lock.
    scenario = db.scalar(select(Scenario).where(Scenario.id == scenario_id).execution_options(populate_existing=True))
    if scenario is None:
        raise _not_found("Scenario")
    return scenario, project


def _version(db: Session, scenario: Scenario) -> SimulationModelVersion:
    return db.scalars(select(SimulationModelVersion).where(
        SimulationModelVersion.project_id == scenario.project_id,
        SimulationModelVersion.version == scenario.version,
    )).one()


def _read(db: Session, scenario: Scenario) -> ScenarioRead:
    # Only runs of the current snapshot count. Editing invalidates old comparison results.
    run = db.scalar(select(SimulationRun).where(
        SimulationRun.scenario_id == scenario.id, SimulationRun.version == scenario.version,
    ).order_by(SimulationRun.created_at.desc(), SimulationRun.id).limit(1))
    return ScenarioRead(id=scenario.id, project_id=scenario.project_id, name=scenario.name,
                        model_version=scenario.version, model=_version(db, scenario).graph,
                        latest_run=_run_read(db, run) if run else None,
                        created_at=scenario.created_at, updated_at=scenario.updated_at)


@router.get("/projects/{project_id}/scenarios", response_model=list[ScenarioRead])
def list_scenarios(project_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _project(db, project_id, user.id)
    scenarios = db.scalars(select(Scenario).where(Scenario.project_id == project_id).order_by(Scenario.created_at, Scenario.id)).all()
    return [_read(db, item) for item in scenarios]


@router.post("/projects/{project_id}/scenarios", response_model=ScenarioRead, status_code=201)
def create_scenario(project_id: UUID, payload: ScenarioCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    model = validate_request_payload(payload.model)
    project = _project(db, project_id, user.id, lock=True)
    version = _save_model(db, project, model)
    scenario = Scenario(project_id=project_id, name=payload.name, version=version.version)
    db.add(scenario)
    db.commit()
    return _read(db, scenario)


@router.get("/scenarios/{scenario_id}", response_model=ScenarioRead)
def get_scenario(scenario_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _read(db, _scenario(db, scenario_id, user.id))


@router.put("/scenarios/{scenario_id}", response_model=ScenarioRead)
def update_scenario(scenario_id: UUID, payload: ScenarioUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if any(getattr(payload, field) is None for field in payload.model_fields_set):
        raise ApiProblem("invalid_configuration", "Scenario name and model cannot be null", [])
    model = validate_request_payload(payload.model) if payload.model is not None else None
    scenario, project = _locked_scenario(db, scenario_id, user.id)
    if payload.name is not None:
        scenario.name = payload.name
    if model is not None and model.model_dump(mode="json") != _version(db, scenario).graph:
        scenario.version = _save_model(db, project, model).version
    db.commit()
    return _read(db, scenario)


@router.post("/scenarios/{scenario_id}/duplicate", response_model=ScenarioRead, status_code=201)
def duplicate_scenario(scenario_id: UUID, payload: ScenarioDuplicate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    original, _ = _locked_scenario(db, scenario_id, user.id)
    # Versions are immutable, so sharing one until the copy is edited is safe.
    duplicate = Scenario(project_id=original.project_id, name=payload.name, version=original.version)
    db.add(duplicate)
    db.commit()
    return _read(db, duplicate)


@router.delete("/scenarios/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scenario(scenario_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    scenario, _ = _locked_scenario(db, scenario_id, user.id)
    db.execute(delete(Scenario).where(Scenario.id == scenario_id))
    db.commit()  # Run history survives via ON DELETE SET NULL.


@router.post("/scenarios/{scenario_id}/runs", response_model=RunPlayback | RunRead, status_code=201)
def run_scenario(scenario_id: UUID, payload: RunCreate | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    scenario, _ = _locked_scenario(db, scenario_id, user.id)
    if payload and payload.model_version is not None and payload.model_version != scenario.version:
        raise ApiProblem("invalid_configuration", "Run the scenario's current model version", [], status_code=409)
    return _execute_run(db, _version(db, scenario), scenario_id=scenario.id,
                        include_timeline=bool(payload and payload.include_timeline))


@router.post("/projects/{project_id}/scenarios/compare", response_model=ScenarioComparison)
def compare_scenarios(project_id: UUID, payload: ComparisonRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _project(db, project_id, user.id, lock=True)
    baseline_record, candidate_record = _scenario(db, payload.baseline_id, user.id), _scenario(db, payload.scenario_id, user.id)
    if baseline_record.project_id != project_id or candidate_record.project_id != project_id:
        raise _not_found("Scenario in this project")
    if baseline_record.id == candidate_record.id:
        raise ApiProblem("invalid_configuration", "Choose two different scenarios", [])
    baseline, candidate = _read(db, baseline_record), _read(db, candidate_record)
    base_run, candidate_run = baseline.latest_run, candidate.latest_run
    if base_run is None or candidate_run is None:
        raise ApiProblem("invalid_configuration", "Run both current scenario snapshots before comparing", [], status_code=409)
    if base_run.duration != candidate_run.duration or base_run.seed != candidate_run.seed:
        raise ApiProblem("invalid_configuration", "Comparison requires identical simulation duration and seed. Match the settings and rerun both scenarios.", [], status_code=409)
    fields = [
        ("average_waiting_time", "Average waiting time", "min"),
        ("maximum_waiting_time", "Maximum waiting time", "min"),
        ("throughput", "Throughput", "entities/hr"),
        ("completion_rate", "Completion rate", "%"),
        ("average_cycle_time", "Average cycle time", "min"),
    ]
    metrics = []
    for key, label, unit in fields:
        first, second = getattr(base_run.summary, key), getattr(candidate_run.summary, key)
        if unit == "%":
            first, second = first * 100, second * 100
        metrics.append(metric_difference(key, label, unit, first, second))
    processes = {node.id: node.name for node in [*baseline.model.nodes, *candidate.model.nodes] if node.type == "process"}
    for node_id, name in processes.items():
        first, second = base_run.node_metrics.get(node_id), candidate_run.node_metrics.get(node_id)
        first_value = first.resource_utilization * 100 if hasattr(first, "resource_utilization") else None
        second_value = second.resource_utilization * 100 if hasattr(second, "resource_utilization") else None
        metrics.append(metric_difference(f"utilization:{node_id}", f"{name} utilization", "%", first_value, second_value))
    return ScenarioComparison(baseline=baseline, scenario=candidate, duration=base_run.duration, seed=base_run.seed, metrics=metrics)
