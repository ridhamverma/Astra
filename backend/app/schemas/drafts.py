"""Persist editable canonical documents without claiming they are executable."""

from collections import Counter

from pydantic import model_validator

from app.schemas.simulation import SimulationModel


class SimulationDraft(SimulationModel):
    # Keep the canonical field/config validation. Incomplete topology is valid
    # while editing; the execution API still validates SimulationModel in full.
    @model_validator(mode="after")
    def validate_graph(self) -> "SimulationDraft":
        identifiers = [node.id for node in self.nodes] + [edge.id for edge in self.edges]
        duplicates = sorted(key for key, count in Counter(identifiers).items() if count > 1)
        if duplicates:
            raise ValueError(f"duplicate node or edge IDs: {', '.join(duplicates)}")
        nodes = {node.id for node in self.nodes}
        for edge in self.edges:
            for field in ("source", "target"):
                identifier = getattr(edge, field)
                if identifier not in nodes:
                    raise ValueError(f"edge '{edge.id}' references missing {field} node '{identifier}'")
        return self
