"""Write the JSON Schema for Astra's simulation result wire format."""

import json
from pathlib import Path

from app.simulation.results import SimulationResult


OUTPUT = Path(__file__).resolve().parents[2] / "docs" / "simulation-result.schema.json"


def schema_text() -> str:
    return json.dumps(SimulationResult.model_json_schema(by_alias=True), indent=2, sort_keys=True) + "\n"


if __name__ == "__main__":
    OUTPUT.write_text(schema_text())
