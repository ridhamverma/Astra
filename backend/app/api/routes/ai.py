from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.ai.explanation import ExplainRequest, ExplanationResponse, explain_results
from app.api.routes.projects import get_run
from app.database.session import get_db
from app.models import SimulationModelVersion, User
from app.api.auth import get_current_user
from app.schemas.simulation import SimulationModel


from app.ai.generation import GenerateRequest, GeneratedDraft, generate_simulation_model
from app.ai.provider import ModelProvider, get_model_provider
from app.api.simulation_validation import ApiProblem

router = APIRouter(prefix="/api/v1/ai", tags=["AI assistance"])

@router.post("/generate-model", response_model=GeneratedDraft)
async def generate_model(body: GenerateRequest, provider: ModelProvider = Depends(get_model_provider)) -> GeneratedDraft:
    if len(body.prompt.strip()) < 10:
        raise ApiProblem("unsupported_input", "Describe your operational system in at least 10 characters", [], 400)
    return await generate_simulation_model(body.prompt.strip(), provider)



def authorized_explanation_sources(body: ExplainRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # Authorize every run before provider setup or disclosure of any measured facts.
    run = get_run(body.run_id, db, user)
    baseline = get_run(body.baseline_run_id, db, user) if body.baseline_run_id else None
    version = db.scalars(select(SimulationModelVersion).where(
        SimulationModelVersion.project_id == run.project_id,
        SimulationModelVersion.version == run.model_version,
    )).one()
    return run, SimulationModel.model_validate(version.graph), baseline


@router.post("/explain-results", response_model=ExplanationResponse)
async def explain_saved_results(sources=Depends(authorized_explanation_sources), provider: ModelProvider = Depends(get_model_provider)) -> ExplanationResponse:
    run, model, baseline = sources
    return await explain_results(run, model, provider, baseline)
