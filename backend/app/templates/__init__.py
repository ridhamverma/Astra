"""Canonical starter graphs. Instances are fresh editable data, never custom engines."""
import json
from importlib.resources import files
from uuid import uuid4
from pydantic import BaseModel
from app.schemas.simulation import SimulationModel
from app.simulation import validate_executable_model

CATALOGUE = (
    ("hospital", "Hospital", "Patient registration, a doctor waiting room and a treatment delay. Treatment here represents time without a limited staff resource."),
    ("bank", "Bank", "A finite waiting area feeding two service counters."),
    ("restaurant", "Restaurant", "Ordering and kitchen queues, payment, preparation and pickup."),
    ("warehouse", "Warehouse", "Picking and packing queues followed by a dispatch delay."),
    ("customer-service", "Customer-service center", "Support agents resolve 80% of requests; 20% go to a specialist."),
)
class StarterTemplate(BaseModel):
    id: str
    name: str
    description: str
    model: SimulationModel


def get_template(template_id: str) -> StarterTemplate:
    entry = next((entry for entry in CATALOGUE if entry[0] == template_id), None)
    if entry is None: raise KeyError(template_id)
    raw = json.loads(files(__package__).joinpath("data", f"{template_id}.json").read_text())
    model = validate_executable_model(SimulationModel.model_validate(raw))
    return StarterTemplate(id=entry[0], name=entry[1], description=entry[2], model=model)


def list_templates() -> list[StarterTemplate]:
    return [get_template(entry[0]) for entry in CATALOGUE]


def instantiate_template(template_id: str, name: str | None = None) -> SimulationModel:
    model = get_template(template_id).model.model_copy(deep=True)
    model.id = str(uuid4())
    model.name = name if name is not None else model.name
    return model
