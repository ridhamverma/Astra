"""Random timing draws for Astra's supported distributions."""

from random import Random

from app.schemas.simulation import Distribution


def sample_duration(
    rng: Random,
    distribution: Distribution,
    mean: float,
    minimum: float | None = None,
    maximum: float | None = None,
) -> float:
    """Draw one duration. Schema validation must run before this function."""
    if distribution == "constant":
        return mean
    if distribution == "exponential":
        return rng.expovariate(1 / mean)
    if distribution == "uniform":
        if minimum is None or maximum is None:
            raise ValueError("uniform distribution requires minimum and maximum")
        return rng.uniform(minimum, maximum)
    raise ValueError(f"unsupported distribution: {distribution}")
