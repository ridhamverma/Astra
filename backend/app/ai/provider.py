"""Provider boundary: structured JSON only, no tools or generated code execution."""
import json
import re
from typing import Protocol

import httpx

from app.api.simulation_validation import ApiProblem
from app.config import get_settings


class ModelProvider(Protocol):
    async def generate(self, instructions: str, prompt: str, schema: dict, feedback: str) -> str: ...


class GeminiProvider:
    def __init__(self, key: str, model: str, transport=None):
        self.key, self.model, self.transport = key, model, transport

    async def generate(self, instructions: str, prompt: str, schema: dict, feedback: str) -> str:
        if not re.fullmatch(r"gemini-[a-zA-Z0-9.-]+", self.model):
            raise ApiProblem("ai_unavailable", "AI model configuration is invalid", [], 503)
        body = {
            "systemInstruction": {"parts": [{"text": instructions}]},
            "contents": [{"role": "user", "parts": [{"text": json.dumps({"description": prompt, "repair_feedback": feedback})}]}],
            "generationConfig": {"responseMimeType": "application/json", "responseJsonSchema": schema, "temperature": 0.1, "maxOutputTokens": 8192},
        }
        try:
            async with httpx.AsyncClient(timeout=30, transport=self.transport) as client:
                async with client.stream("POST", f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent", headers={"x-goog-api-key": self.key}, json=body) as response:
                    if response.status_code != 200:
                        raise ApiProblem("ai_unavailable", "AI service is unavailable. Check backend credentials, model availability and quota; manual editing remains available.", [], 503)
                    chunks = bytearray()
                    async for chunk in response.aiter_bytes():
                        chunks.extend(chunk)
                        if len(chunks) > 250_000:
                            raise ApiProblem("invalid_ai_output", "AI response exceeded the size limit", [], 502)
            data = json.loads(chunks)
            candidate = data.get("candidates", [{}])[0]
            if candidate.get("finishReason") != "STOP":
                return "{}"  # Blocked/truncated output must pass the same bounded repair path.
            return "".join(part.get("text", "") for part in candidate.get("content", {}).get("parts", []) if not part.get("thought"))
        except (httpx.HTTPError, ValueError, IndexError, TypeError, AttributeError):
            raise ApiProblem("ai_unavailable", "AI service returned an unreadable response or timed out. Manual editing remains available.", [], 503) from None


def get_model_provider() -> ModelProvider:
    settings = get_settings()
    if settings.ai_provider != "gemini" or not settings.gemini_api_key or not settings.gemini_api_key.get_secret_value():
        raise ApiProblem("ai_unavailable", "AI features need a Gemini API key configured on the backend. Manual editing and simulation remain available.", [], 503)
    return GeminiProvider(settings.gemini_api_key.get_secret_value(), settings.gemini_model)
