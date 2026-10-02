"""Write the JSON Schema derived from the canonical Pydantic model."""

import json
from pathlib import Path

from app.schemas.simulation import SimulationModel


OUTPUT = Path(__file__).resolve().parents[2] / "docs" / "simulation-model.schema.json"


def schema_text() -> str:
    return json.dumps(SimulationModel.model_json_schema(), indent=2, sort_keys=True) + "\n"


if __name__ == "__main__":
    OUTPUT.write_text(schema_text())
