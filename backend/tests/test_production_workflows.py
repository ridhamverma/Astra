"""Regression coverage for draft persistence and scenario/project isolation."""
from copy import deepcopy

from test_persistence import client_for, simple_model, test_database as test_database


def test_scenario_edits_and_deletion_do_not_replace_project_model(test_database):
    client = client_for(test_database)
    original = simple_model()
    project = client.post('/api/v1/projects', json={'name': 'Project baseline', 'model': original}).json()
    project_id = project['id']
    scenario = client.post(f'/api/v1/projects/{project_id}/scenarios', json={'name': 'Experiment', 'model': original}).json()
    changed = deepcopy(original)
    changed['nodes'][1]['config']['resource_count'] = 3
    response = client.put(f"/api/v1/scenarios/{scenario['id']}", json={'model': changed})
    assert response.status_code == 200, response.text
    loaded = client.get(f'/api/v1/projects/{project_id}').json()
    assert loaded['model'] == project['model']
    assert loaded['latest_version'] == project['latest_version']
    scenario_run = client.post(f"/api/v1/scenarios/{scenario['id']}/runs", json={}).json()
    assert client.delete(f"/api/v1/scenarios/{scenario['id']}").status_code == 204
    loaded = client.get(f'/api/v1/projects/{project_id}').json()
    assert loaded['model'] == project['model']
    assert loaded['status'] == 'needs_review'
    assert client.get(f"/api/v1/runs/{scenario_run['id']}").json()['summary'] == scenario_run['summary']
    baseline_run = client.post(f'/api/v1/projects/{project_id}/runs', json={'include_timeline': True}).json()
    assert baseline_run['model'] == project['model']
    assert baseline_run['model_version'] == project['latest_version']


def test_unfinished_builder_can_save_and_reopen_but_cannot_run(test_database):
    client = client_for(test_database)
    draft = simple_model()
    draft['nodes'] = draft['nodes'][:1]
    draft['edges'] = []
    response = client.post('/api/v1/projects', json={'name': 'Work in progress', 'model': draft})
    assert response.status_code == 201, response.text
    project = response.json()
    reopened = client_for(test_database, previous=client).get(f"/api/v1/projects/{project['id']}")
    assert reopened.status_code == 200
    assert reopened.json()['model'] == project['model']
    assert client.post(f"/api/v1/projects/{project['id']}/runs", json={}).status_code == 422
    completed = simple_model()
    assert client.put(f"/api/v1/projects/{project['id']}", json={'model': completed}).status_code == 200
    assert client.post(f"/api/v1/projects/{project['id']}/runs", json={}).status_code == 201


def test_project_save_is_idempotent_and_rejects_stale_edit(test_database):
    client = client_for(test_database)
    project = client.post('/api/v1/projects', json={'name': 'Versioned', 'model': simple_model()}).json()
    path = f"/api/v1/projects/{project['id']}"
    repeated = client.put(path, json={'model': simple_model(), 'expected_version': 1})
    assert repeated.status_code == 200
    assert repeated.json()['latest_version'] == 1
    changed = deepcopy(simple_model())
    changed['nodes'][1]['config']['resource_count'] = 2
    updated = client.put(path, json={'model': changed, 'expected_version': 1})
    assert updated.status_code == 200
    assert updated.json()['latest_version'] == 2
    stale = client.put(path, json={'model': simple_model(), 'expected_version': 1})
    assert stale.status_code == 409
    assert client.get(path).json()['model'] == updated.json()['model']
    pinned = client.post(path + '/runs', json={'model_version': 1, 'include_timeline': True})
    assert pinned.status_code == 201
    assert pinned.json()['model'] == project['model']


def test_blank_project_first_save_detects_another_tab(test_database):
    client = client_for(test_database)
    project = client.post('/api/v1/projects', json={'name': 'Blank'}).json()
    path = f"/api/v1/projects/{project['id']}"
    assert client.put(path, json={'model': simple_model(), 'expected_version': 0}).status_code == 200
    assert client.put(path, json={'model': simple_model(), 'expected_version': 0}).status_code == 409


def test_scenario_versions_do_not_collide_and_stale_scenario_save_fails(test_database):
    client = client_for(test_database)
    project = client.post('/api/v1/projects', json={'name': 'Independent', 'model': simple_model()}).json()
    path = f"/api/v1/projects/{project['id']}"
    scenario = client.post(path + '/scenarios', json={'name': 'Candidate', 'model': simple_model()}).json()
    changed = deepcopy(simple_model())
    changed['nodes'][1]['config']['resource_count'] = 2
    updated = client.put(f"/api/v1/scenarios/{scenario['id']}", json={'model': changed, 'expected_version': scenario['model_version']}).json()
    assert updated['model_version'] == 3
    assert client.put(f"/api/v1/scenarios/{scenario['id']}", json={'model': simple_model(), 'expected_version': scenario['model_version']}).status_code == 409
    assert client.put(path, json={'model': changed, 'expected_version': 1}).json()['latest_version'] == 4
    assert client.get(path + '/versions').json() == [4, 1]
    assert client.post(path + '/runs', json={'model_version': 3}).status_code == 409
    result = client.post(f"/api/v1/scenarios/{scenario['id']}/runs", json={'model_version': 3}).json()
    assert result['is_scenario'] is True
    assert client.delete(f"/api/v1/scenarios/{scenario['id']}").status_code == 204
    assert client.get(f"/api/v1/runs/{result['id']}").json()['is_scenario'] is True


def test_drafts_still_validate_configs_references_names_and_limits(test_database):
    client = client_for(test_database)
    for field, value in [('resource_count', 0), ('resource_count', 101), ('mean_service_time', float('inf'))]:
        draft = simple_model()
        draft['nodes'][1]['config'][field] = value
        # Use JSON text for infinity so the API, rather than httpx, validates it.
        import json
        response = client.post('/api/v1/projects', content=json.dumps({'name': 'Invalid', 'model': draft}), headers={'Content-Type': 'application/json'})
        assert response.status_code in {400, 422}, response.text
    invalid = simple_model()
    invalid['edges'][0]['target'] = 'missing'
    assert client.post('/api/v1/projects', json={'name': 'Dangling', 'model': invalid}).status_code == 422
    response = client.post('/api/v1/projects', json={'name': '   '})
    assert response.status_code == 400
    assert response.json()['error']['details'][0]['path'] == 'body.name'
    assert client.post('/api/v1/projects', json={'name': '  Trimmed  '}).json()['name'] == 'Trimmed'


def test_registration_rejects_blank_name_and_normalizes_valid_name(test_database):
    from uuid import uuid4
    client = client_for(test_database, authenticated=False)
    payload = {'email': f'name-{uuid4().hex}@example.com', 'password': 'name-test-password-123', 'display_name': '   '}
    response = client.post('/api/v1/auth/register', json=payload)
    assert response.status_code == 400
    assert response.json()['error']['details'][0]['path'] == 'body.display_name'
    payload['display_name'] = '  Review tester  '
    response = client.post('/api/v1/auth/register', json=payload)
    assert response.status_code == 201
    assert response.json()['user']['display_name'] == 'Review tester'


def test_access_tracking_cannot_revert_a_concurrent_edit_timestamp(test_database, monkeypatch):
    from datetime import datetime, timezone
    from uuid import UUID
    from sqlalchemy.orm import Session
    from app.api.routes import projects
    from app.models import Project, User
    client = client_for(test_database)
    created = client.post('/api/v1/projects', json={'name': 'Activity race'}).json()
    project_id = UUID(created['id'])
    with Session(test_database) as stale_session:
        stale_project = stale_session.get(Project, project_id)
        user = stale_session.get(User, UUID(created['user_id']))
        original_timestamp = stale_project.updated_at
        newer_timestamp = datetime.now(timezone.utc)
        with Session(test_database) as writer:
            record = writer.get(Project, project_id)
            record.updated_at = newer_timestamp
            writer.commit()
        assert newer_timestamp > original_timestamp
        monkeypatch.setattr(projects, '_project', lambda *args, **kwargs: stale_project)
        projects.record_project_access(project_id, stale_session, user)
    with Session(test_database) as reader:
        assert reader.get(Project, project_id).updated_at == newer_timestamp


def test_snapshot_migration_recovers_known_origins_without_deleting_history(test_database):
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import text
    from test_persistence import BACKEND
    client = client_for(test_database)
    project = client.post('/api/v1/projects', json={'name': 'Legacy snapshots', 'model': simple_model()}).json()
    path = f"/api/v1/projects/{project['id']}"
    scenario = client.post(path + '/scenarios', json={'name': 'Legacy scenario', 'model': simple_model()}).json()
    assert client.post(f"/api/v1/scenarios/{scenario['id']}/runs", json={}).status_code == 201
    modified = deepcopy(simple_model())
    modified['nodes'][1]['config']['resource_count'] = 2
    assert client.put(f"/api/v1/scenarios/{scenario['id']}", json={'model': modified}).status_code == 200
    config = Config(str(BACKEND / 'alembic.ini'))
    config.attributes['database_url'] = test_database.url.render_as_string(hide_password=False)
    # This fixture is a disposable database, never the configured application DB.
    command.downgrade(config, '0006_project_activity')
    command.upgrade(config, 'head')
    with test_database.connect() as connection:
        rows = connection.execute(text('SELECT version, is_scenario FROM simulation_model_versions WHERE project_id=:id ORDER BY version'), {'id': project['id']}).all()
    assert rows == [(1, False), (2, True), (3, True)]
    assert client.get(path).json()['latest_version'] == 1
    assert len(client.get(path + '/runs').json()) == 1
