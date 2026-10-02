import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.ai.generation import structured_schema
from app.ai.provider import GeminiProvider, get_model_provider
from app.config import Settings
from app.main import create_app
from app.schemas.simulation import SimulationModel

EXAMPLES = Path(__file__).resolve().parents[2] / 'docs/examples'
ENDPOINT = '/api/v1/ai/generate-model'

class FixtureProvider:
    def __init__(self, outputs):
        self.outputs = outputs
        self.calls = []
    async def generate(self, instructions, prompt, schema, feedback):
        self.calls.append((instructions, prompt, schema, feedback))
        return self.outputs[min(len(self.calls) - 1, len(self.outputs) - 1)]

def draft(name='bank'):
    return {'model': json.loads((EXAMPLES / f'{name}.json').read_text()), 'assumptions': ['All times are minutes.']}

def client_for(provider):
    app = create_app()
    app.dependency_overrides[get_model_provider] = lambda: provider
    return TestClient(app)

@pytest.mark.parametrize('name,prompt', [
    ('bank', 'A bank with a waiting queue and two counters.'),
    ('simple', 'Customers arrive, receive service, then leave.'),
    ('hospital', 'Patients register, queue for a doctor, then branch to pharmacy or delay before leaving.'),
])
def test_valid_drafts_use_canonical_model_without_running(name, prompt, monkeypatch):
    # Fixtures test the integration contract; these do not claim to test live LLM extraction.
    def forbidden(*args, **kwargs): raise AssertionError('Generation must not simulate')
    monkeypatch.setattr('app.simulation.engine.simulate', forbidden)
    provider = FixtureProvider([json.dumps(draft(name))])
    response = client_for(provider).post(ENDPOINT, json={'prompt': prompt})
    assert response.status_code == 200
    body = response.json()
    assert body['model'] == SimulationModel.model_validate(draft(name)['model']).model_dump(mode='json')
    assert body['assumptions'] == ['All times are minutes.']
    assert len(provider.calls) == 1
    assert client_for(provider).post('/api/v1/simulations/validate', json=body['model']).json()['valid']

@pytest.mark.parametrize('failure', ['json', 'resources', 'reference', 'cycle', 'probability', 'distribution', 'code', 'limits'])
def test_invalid_output_is_repaired_before_return(failure):
    bad = draft('hospital' if failure in {'cycle', 'probability'} else 'simple')
    if failure == 'resources': bad['model']['nodes'][1]['config']['resource_count'] = 0
    if failure == 'reference': bad['model']['edges'][0]['target'] = 'missing'
    if failure == 'cycle':
        next(edge for edge in bad['model']['edges'] if edge['id'] == 'e-pharmacy-discharge')['target'] = 'next-step'
    if failure == 'probability':
        next(edge for edge in bad['model']['edges'] if edge.get('probability') is not None)['probability'] = 0.99
    if failure == 'distribution': bad['model']['nodes'][0]['config']['distribution'] = 'normal'
    if failure == 'code': bad['model']['python'] = 'print("never execute")'
    if failure == 'limits': bad['model']['simulation']['duration'] = 10081
    provider = FixtureProvider(['not json' if failure == 'json' else json.dumps(bad), json.dumps(draft())])
    response = client_for(provider).post(ENDPOINT, json={'prompt': 'Build a bank with two counters.'})
    assert response.status_code == 200
    assert len(provider.calls) == 2
    assert 'failed validation' in provider.calls[1][3]


def test_repair_limit_and_manual_fallback():
    provider = FixtureProvider(['{}'])
    client = client_for(provider)
    response = client.post(ENDPOINT, json={'prompt': 'Build a bank with two counters.'})
    assert response.status_code == 502
    assert len(provider.calls) == 3
    assert client.get('/health').status_code == 200
    assert client.post('/api/v1/simulations/run', json=draft('simple')['model']).status_code == 200

@pytest.mark.parametrize('body', [{'prompt': ''}, {'prompt': ' ' * 10}, {'prompt': 'x' * 6001}, {'prompt': 'bank system', 'key': 'not-allowed'}])
def test_prompt_bounds(body):
    provider = FixtureProvider([json.dumps(draft())])
    assert client_for(provider).post(ENDPOINT, json=body).status_code == 400
    assert not provider.calls


def test_missing_key_is_optional(monkeypatch):
    monkeypatch.setattr('app.ai.provider.get_settings', lambda: Settings(_env_file=None, gemini_api_key=None))
    client = TestClient(create_app())
    response = client.post(ENDPOINT, json={'prompt': 'Build a bank with two counters.'})
    assert response.status_code == 503
    assert client.get('/health').status_code == 200


def test_gemini_structured_request_and_secret_stays_server_side():
    captured = []
    def handle(request):
        body = json.loads(request.content)
        captured.append(body)
        assert request.headers['x-goog-api-key'] == 'test-private-key'
        assert 'test-private-key' not in str(request.url)
        return httpx.Response(200, json={'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': json.dumps(draft())}]}}]})
    provider = GeminiProvider('test-private-key', 'gemini-2.5-flash', httpx.MockTransport(handle))
    response = client_for(provider).post(ENDPOINT, json={'prompt': 'Build a bank with two counters.'})
    assert response.status_code == 200
    assert 'test-private-key' not in response.text
    assert captured[0]['generationConfig']['responseMimeType'] == 'application/json'
    assert captured[0]['generationConfig']['responseJsonSchema'] == structured_schema()
    assert 'tools' not in captured[0]

@pytest.mark.parametrize('status', [401, 429, 500])
def test_provider_errors_are_sanitized(status):
    provider = GeminiProvider('test-private-key', 'gemini-2.5-flash', httpx.MockTransport(lambda request: httpx.Response(status, text='test-private-key sensitive upstream error')))
    response = client_for(provider).post(ENDPOINT, json={'prompt': 'Build a bank with two counters.'})
    assert response.status_code == 503
    assert 'test-private-key' not in response.text
    assert 'sensitive' not in response.text


def test_schema_is_derived_with_exactly_six_types():
    schema = structured_schema()
    variants = schema['properties']['model']['properties']['nodes']['items']['anyOf']
    assert {node['properties']['type']['enum'][0] for node in variants} == {'source','queue','process','decision','delay','sink'}
    assert 'discriminator' not in json.dumps(schema)


def test_transport_timeout_is_sanitized():
    def handle(request):
        raise httpx.ReadTimeout('private upstream details', request=request)
    provider = GeminiProvider('test-private-key', 'gemini-2.5-flash', httpx.MockTransport(handle))
    response = client_for(provider).post(ENDPOINT, json={'prompt': 'Build a bank with two counters.'})
    assert response.status_code == 503
    assert 'private upstream' not in response.text


def test_truncated_provider_outputs_use_bounded_repair():
    calls = []
    def handle(request):
        calls.append(request)
        return httpx.Response(200, json={'candidates': [{'finishReason': 'MAX_TOKENS', 'content': {'parts': [{'text': json.dumps(draft())}]}}]})
    provider = GeminiProvider('test-private-key', 'gemini-2.5-flash', httpx.MockTransport(handle))
    response = client_for(provider).post(ENDPOINT, json={'prompt': 'Build a bank with two counters.'})
    assert response.status_code == 502
    assert len(calls) == 3


def test_oversized_provider_response_is_rejected():
    provider = GeminiProvider('test-private-key', 'gemini-2.5-flash', httpx.MockTransport(lambda request: httpx.Response(200, content=b'x' * 250001)))
    response = client_for(provider).post(ENDPOINT, json={'prompt': 'Build a bank with two counters.'})
    assert response.status_code == 502
