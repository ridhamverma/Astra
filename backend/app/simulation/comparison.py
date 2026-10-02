"""Pure arithmetic for measured metrics; positive differences mean candidate minus baseline."""
from app.schemas.scenarios import MetricDifference


def metric_difference(key: str, label: str, unit: str, baseline: float | None, scenario: float | None) -> MetricDifference:
    # Zero/unknown baselines cannot produce a meaningful percentage; preserve null.
    difference = None if baseline is None or scenario is None else scenario - baseline
    percentage = None if difference is None or baseline == 0 else difference / abs(baseline) * 100
    return MetricDifference(key=key, label=label, unit=unit, baseline=baseline, scenario=scenario,
                            absolute_difference=difference, percentage_difference=percentage)
