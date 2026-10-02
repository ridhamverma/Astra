"""Reproduce Phase 19 measurements; optional localhost HTTP checks use a test account."""

import argparse
import json
from pathlib import Path
from statistics import median
import sys
from time import perf_counter
from uuid import uuid4
import httpx
from app.simulation import simulate
from app.templates import get_template, list_templates


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url")
    parser.add_argument("--output", default="../docs/performance-results.json")
    parser.add_argument("--timeline", default="/tmp/astra-phase19-timeline.json")
    args = parser.parse_args()
    report = {
        "python": sys.version.split()[0],
        "platform": sys.platform,
        "samples_per_case": 3,
        "simulations": [],
        "api": [],
    }
    models = [(s.name, s.model) for s in list_templates()]
    large = get_template("bank").model.model_copy(deep=True)
    large.nodes = [large.nodes[0], large.nodes[2], large.nodes[3]]
    # Revalidate after editing, exactly as user requests are validated.
    raw = large.model_dump(mode="json")
    raw["edges"] = [
        {"id": "large-in", "source": "arrivals", "target": "counters"},
        {"id": "large-out", "source": "counters", "target": "exit"},
    ]
    raw["simulation"]["duration"] = 10080
    raw["nodes"][0]["config"] = {
        "distribution": "constant",
        "mean_interarrival_time": 0.01,
        "max_entities": 10000,
    }
    raw["nodes"][1]["config"] = {
        "service_distribution": "constant",
        "mean_service_time": 0.001,
        "resource_count": 100,
    }
    models.append(("10,000 entities / 100 resources", raw))
    for name, model in models:
        times = []
        for _ in range(3):
            started = perf_counter()
            result = simulate(model)
            times.append((perf_counter() - started) * 1000)
        report["simulations"].append(
            {
                "case": name,
                "median_ms": round(median(times), 3),
                "max_ms": round(max(times), 3),
                "events": len(result.events),
                "entities": result.summary.total_generated,
                "completed": result.summary.total_completed,
            }
        )
        if name.startswith("10,000"):
            Path(args.timeline).write_text(
                json.dumps(
                    {
                        "duration": 10080,
                        "expected_completed": result.summary.total_completed,
                        "events": [e.model_dump() for e in result.events],
                    }
                )
            )
    if args.api_url:
        # No user's project is modified. Credentials are random and never logged.
        with httpx.Client(base_url=args.api_url, timeout=30) as client:
            response = client.post(
                "/api/v1/auth/register",
                json={
                    "email": f"performance-{uuid4().hex}@example.com",
                    "display_name": "Performance verification",
                    "password": uuid4().hex,
                },
            )
            response.raise_for_status()
            client.headers["X-Astra-CSRF"] = response.json()["csrf_token"]
            try:
                for name, model in [
                    ("Bank", get_template("bank").model.model_dump(mode="json")),
                    ("10,000 entities / 100 resources", raw),
                ]:
                    times = []
                    for _ in range(3):
                        started = perf_counter()
                        response = client.post("/api/v1/simulations/run", json=model)
                        times.append((perf_counter() - started) * 1000)
                        response.raise_for_status()
                    data = response.json()
                    report["api"].append(
                        {
                            "case": name,
                            "median_ms": round(median(times), 3),
                            "max_ms": round(max(times), 3),
                            "http_status": response.status_code,
                            "events": len(data["events"]),
                            "response_bytes": len(response.content),
                            "transport": "localhost HTTP including JSON serialization/transfer",
                        }
                    )
            finally:
                client.post("/api/v1/auth/logout")
    Path(args.output).write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
