"""Explainable heuristic: busy capacity corroborated by measured congestion.

score = utilization * max(W/(W+S), Q/(Q+R), rejected/queue_arrivals)
W = Process mean resource wait, S = measured mean service (configured fallback),
Q = combined time-weighted backlog of directly feeding Queues, R = resource count.

There are no fitted weights or peer-max normalization. One service duration of
waiting and one waiting entity per server each normalize to 0.5 by construction.
The max takes the strongest evidence without adding correlated Queue/Process waits.
Multiplication requires busy capacity AND congestion. Maxima are reported as
burst evidence, not scored: a single outlier must not dominate sustained averages.
The score is a ranking heuristic, not a probability or proof of optimal capacity.
"""
from collections.abc import Mapping

from app.schemas.bottlenecks import BottleneckAnalysis, BottleneckEvidence, QueueEvidence, RankedBottleneck
from app.schemas.simulation import ProcessNode, QueueNode, SimulationModel
from app.simulation.results import ProcessMetrics, QueueMetrics


def analyze_bottlenecks(model: SimulationModel, node_metrics: Mapping[str, ProcessMetrics | QueueMetrics]) -> BottleneckAnalysis:
    """Pure and reproducible for the same graph/metrics; never executes simulation."""
    processes = sorted((node for node in model.nodes if isinstance(node, ProcessNode)), key=lambda node: node.id)
    queues = {node.id: node for node in model.nodes if isinstance(node, QueueNode)}
    feeding: dict[str, set[str]] = {node.id: set() for node in processes}
    for edge in model.edges:
        if edge.source in queues and edge.target in feeding:
            feeding[edge.target].add(edge.source)
    ranked: list[RankedBottleneck] = []
    notes: list[str] = []
    for node in processes:
        metrics = node_metrics.get(node.id)
        if not isinstance(metrics, ProcessMetrics):
            notes.append(f"{node.name} ({node.id}) has no Process metrics and was not ranked.")
            continue
        queue_evidence = []
        for queue_id in sorted(feeding[node.id]):
            queue_metrics = node_metrics.get(queue_id)
            if not isinstance(queue_metrics, QueueMetrics):
                notes.append(f"{queues[queue_id].name} ({queue_id}) has no Queue metrics; congestion evidence is incomplete.")
                continue
            queue_evidence.append(QueueEvidence(node_id=queue_id, name=queues[queue_id].name,
                                               **queue_metrics.model_dump(exclude={"total_exited"})))
        # Process waits already include requests made by all directly feeding Queues.
        # Never add the Queue waiting averages to the Process waiting average.
        service_time = metrics.average_service_time
        basis = "measured" if service_time is not None and service_time > 0 else "configured"
        reference = service_time if basis == "measured" else node.config.mean_service_time
        wait = metrics.average_waiting_time
        normalized_wait = wait / (wait + reference) if wait is not None and wait > 0 else 0.0
        mean_queue = sum(queue.average_queue_length for queue in queue_evidence) if queue_evidence else None
        normalized_queue = mean_queue / (mean_queue + metrics.resource_count) if mean_queue is not None and mean_queue > 0 else 0.0
        arrivals = sum(queue.total_arrivals for queue in queue_evidence)
        rejected = sum(queue.rejected_entities for queue in queue_evidence) if queue_evidence else None
        rejection_fraction = rejected / arrivals if rejected is not None and arrivals else 0.0
        pressure = max(normalized_wait, normalized_queue, rejection_fraction)
        utilization = max(0.0, min(1.0, metrics.resource_utilization))  # Guard floating point round-off.
        score = utilization * pressure
        evidence = BottleneckEvidence(
            utilization=metrics.resource_utilization, average_waiting_time=wait,
            maximum_waiting_time=metrics.maximum_waiting_time,
            reference_service_time=reference, service_time_basis=basis,
            average_queue_length=mean_queue,
            maximum_queue_length=max((queue.maximum_queue_length for queue in queue_evidence), default=None),
            waiting_at_end=sum(queue.waiting_at_end for queue in queue_evidence) if queue_evidence else None,
            rejected_entities=rejected, normalized_waiting=normalized_wait,
            normalized_queue=normalized_queue, rejection_fraction=rejection_fraction,
            congestion_pressure=pressure, upstream_queues=queue_evidence,
        )
        reasons = [f"{node.name} utilization is {metrics.resource_utilization * 100:.2f}%."]
        if wait is not None:
            reasons.append(f"Mean resource waiting time is {wait:.2f} min; maximum is {metrics.maximum_waiting_time:.2f} min." if metrics.maximum_waiting_time is not None else f"Mean resource waiting time is {wait:.2f} min.")
        else:
            reasons.append("No finished resource waits are available; waiting time is unknown.")
        if queue_evidence:
            reasons.append(f"Direct upstream Queues average {mean_queue:.2f} waiting entities in total; the largest individual queue peak is {evidence.maximum_queue_length}.")
            reasons.append(f"{evidence.waiting_at_end} entities remain in those Queues at the simulation horizon; {rejected} were rejected.")
        else:
            reasons.append("No measured direct upstream Queue; queue length is unavailable.")
        reasons.append(f"Score {score:.4f} = utilization {utilization:.4f} × congestion pressure {pressure:.4f}.")
        if basis == "configured":
            reasons.append(f"No completed service duration; normalization uses the configured mean of {reference:.2f} min.")
        ranked.append(RankedBottleneck(node_id=node.id, name=node.name, score=score, evidence=evidence, reasons=reasons))

    # Full precision sorting before any UI formatting. Stable node IDs resolve exact ties.
    ranked.sort(key=lambda item: (-item.score, -item.evidence.utilization,
                                  -(item.evidence.average_waiting_time or 0), item.node_id))
    primary = ranked[0] if ranked and ranked[0].score > 0 else None
    status = "detected" if primary else "not_applicable" if not processes else "insufficient_data" if not ranked or notes else "no_congestion"
    reasons = primary.reasons if primary else [
        "No Process stages to analyze." if not processes else
        "No measured Process metrics are available." if not ranked else
        "Missing metrics prevent a reliable no-congestion conclusion." if notes else
        "No resource waiting, upstream queue backlog, or rejection corroborates a bottleneck in this run."
    ]
    if primary and sum(item.score == primary.score for item in ranked) > 1:
        notes.append("Equal scores are resolved by utilization, mean resource waiting time, then node ID.")
    notes.append("Waiting averages exclude unfinished waits; upstream Queue backlog and horizon counts include remaining waiters. Direct Process pending-request counts are not available without an explicit Queue.")
    return BottleneckAnalysis(status=status, primary_bottleneck=primary.node_id if primary else None,
                              score=primary.score if primary else 0.0, reasons=reasons, ranked=ranked, notes=notes)
