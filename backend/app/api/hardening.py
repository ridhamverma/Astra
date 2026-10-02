"""Bound ingress memory and simultaneous expensive operations before parsing JSON."""

import asyncio
import json
import logging
from threading import BoundedSemaphore
from time import monotonic
from starlette.types import ASGIApp, Scope, Receive, Send

MAX_BODY_BYTES = 1_048_576
MAX_BODY_SECONDS = 10
MAX_CONCURRENT_RUN_REQUESTS = 2


class RequestSafetyMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app
        self.runs = BoundedSemaphore(MAX_CONCURRENT_RUN_REQUESTS)

    async def reject(self, send, status, code, message):
        body = json.dumps(
            {"error": {"code": code, "message": message, "details": []}}
        ).encode()
        headers = [
            (b"content-type", b"application/json"),
            (b"cache-control", b"no-store"),
            (b"x-content-type-options", b"nosniff"),
        ]
        if status == 429:
            headers.append((b"retry-after", b"1"))
        await send(
            {"type": "http.response.start", "status": status, "headers": headers}
        )
        await send({"type": "http.response.body", "body": body})

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        path = scope["path"]
        expensive = scope["method"] == "POST" and (
            path in {"/api/v1/simulations/run", "/api/v1/optimize"}
            or path.endswith("/runs")
        )
        admitted = False
        if expensive:
            admitted = self.runs.acquire(blocking=False)
            if not admitted:
                return await self.reject(
                    send,
                    429,
                    "rate_limited",
                    "Simulation capacity is busy. Retry shortly.",
                )
        response_started = False
        try:
            chunks = []
            size = 0
            started = monotonic()
            while True:
                remaining = MAX_BODY_SECONDS - (monotonic() - started)
                try:
                    if remaining <= 0:
                        raise TimeoutError
                    message = await asyncio.wait_for(receive(), remaining)
                except TimeoutError:
                    return await self.reject(
                        send, 408, "unsupported_input", "Request body timed out"
                    )
                if message["type"] == "http.disconnect":
                    return
                chunk = message.get("body", b"")
                size += len(chunk)
                if size > MAX_BODY_BYTES:
                    return await self.reject(
                        send,
                        413,
                        "unsupported_input",
                        "Request body exceeds the 1 MiB limit",
                    )
                chunks.append(chunk)
                if not message.get("more_body", False):
                    break
            body = b"".join(chunks)
            delivered = False

            async def bounded_receive():
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {"type": "http.request", "body": body, "more_body": False}
                return await receive()

            async def safe_send(message):
                nonlocal response_started
                if message["type"] == "http.response.start":
                    response_started = True
                    message["headers"] = [
                        *message.get("headers", []),
                        (b"x-content-type-options", b"nosniff"),
                        (b"referrer-policy", b"same-origin"),
                    ]
                    if path.startswith("/api/"):
                        message["headers"] = [
                            item
                            for item in message["headers"]
                            if item[0].lower() != b"cache-control"
                        ] + [(b"cache-control", b"no-store")]
                await send(message)

            await self.app(scope, bounded_receive, safe_send)
        except Exception as error:
            logging.getLogger(__name__).error(
                "API failure at %s (%s)", path, type(error).__name__
            )
            if response_started:
                raise
            await self.reject(
                send, 500, "internal_server_error", "Internal server error"
            )
        finally:
            if admitted:
                self.runs.release()
