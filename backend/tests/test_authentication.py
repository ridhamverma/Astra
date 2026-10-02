"""Real PostgreSQL sessions, two users and adversarial resource IDs. No auth overrides."""
from test_persistence import test_database as test_database
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.api.auth import digest, PASSWORDS, _attempts
from app.models import AuthSession, User, Project
from test_persistence import client_for, simple_model

PASSWORD = "test-only-unique-passphrase"
def register(client, email=None):
    email = email or f"auth-{uuid4().hex}@example.com"
    r = client.post("/api/v1/auth/register", json={"email":email,"password":PASSWORD,"display_name":"Auth tester"})
    assert r.status_code == 201, r.text
    client.headers["X-Astra-CSRF"] = r.json()["csrf_token"]
    return email, r

def test_auth_lifecycle_hashes_rotation_revocation_restart(test_database):
    client=client_for(test_database, authenticated=False)
    email,r=register(client)
    user=r.json()["user"]
    assert set(user)=={"id","email","display_name"}
    assert "HttpOnly" in r.headers["set-cookie"] and "SameSite=lax" in r.headers["set-cookie"]
    token=client.cookies["astra_session"]
    with Session(test_database) as db:
        record=db.scalar(select(User).where(User.email==email))
        assert record.password_hash.startswith("$argon2id$") and PASSWORDS.verify(record.password_hash,PASSWORD)
        session=db.get(AuthSession,digest(token))
        assert session and session.token_hash != token
    restarted=client_for(test_database,previous=client)
    assert restarted.get("/api/v1/auth/me").json()["user"]==user
    assert restarted.post("/api/v1/auth/login",json={"email":email,"password":"wrong-password-long"}).status_code==401
    assert restarted.post("/api/v1/auth/login",json={"email":email.upper(),"password":PASSWORD}).status_code==200
    assert restarted.cookies["astra_session"]!=token
    stale=client_for(test_database,authenticated=False); stale.cookies.set("astra_session",token)
    assert stale.get("/api/v1/auth/me").status_code==401
    csrf=restarted.get("/api/v1/auth/me").json()["csrf_token"]
    restarted.headers["X-Astra-CSRF"]=csrf
    newtoken=restarted.cookies["astra_session"]
    assert restarted.post("/api/v1/auth/logout").status_code==204
    assert restarted.get("/api/v1/auth/me").status_code==401
    stale.cookies.set("astra_session",newtoken)
    assert stale.get("/api/v1/auth/me").status_code==401

def test_input_origin_csrf_expiry_and_throttle(test_database):
    client=client_for(test_database,authenticated=False)
    email,_=register(client)
    assert client.post("/api/v1/auth/register",json={"email":email.upper(),"password":PASSWORD,"display_name":"Duplicate"}).status_code==409
    assert client.post("/api/v1/auth/login",json={"email":"invalid","password":"short"}).status_code==400
    assert client.post("/api/v1/auth/login",json={"email":email,"password":PASSWORD},headers={"Origin":"https://evil.example"}).status_code==403
    client.headers.pop("X-Astra-CSRF")
    assert client.post("/api/v1/projects",json={"name":"CSRF"}).status_code==403
    assert client.post("/api/v1/auth/logout").status_code==403
    client.headers["X-Astra-CSRF"]=client.get("/api/v1/auth/me").json()["csrf_token"]
    assert client.post("/api/v1/projects",json={"name":"CSRF"},headers={"Origin":"https://evil.example"}).status_code==403
    with Session(test_database) as db:
        session=db.get(AuthSession,digest(client.cookies["astra_session"]))
        session.expires_at=datetime.now(timezone.utc)-timedelta(seconds=1); db.commit()
    assert client.get("/api/v1/auth/me").status_code==401
    _attempts.clear()
    for _ in range(30):
        assert client.post("/api/v1/auth/login",json={"email":"missing@example.com","password":PASSWORD}).status_code==401
    assert client.post("/api/v1/auth/login",json={"email":email,"password":PASSWORD}).status_code==429

def test_anonymous_all_protected_endpoints(test_database):
    c=client_for(test_database,authenticated=False); uid=str(uuid4()); model=simple_model()
    paths=[("GET","/api/v1/projects",None),("POST","/api/v1/projects",{"name":"No"}),
      ("GET",f"/api/v1/projects/{uid}",None),("GET",f"/api/v1/runs/{uid}",None),
      ("GET",f"/api/v1/scenarios/{uid}",None),("POST","/api/v1/simulations/validate",model),
      ("POST","/api/v1/simulations/run",model),("POST","/api/v1/optimize",{}),
      ("POST","/api/v1/ai/generate-model",{"prompt":"Build a bank"}),
      ("POST","/api/v1/ai/explain-results",{"run_id":uid})]
    for method,path,body in paths: assert c.request(method,path,json=body).status_code==401, path
    assert c.get("/health").status_code==200

def test_complete_two_user_isolation(test_database, monkeypatch):
    from app.config import Settings
    monkeypatch.setattr("app.ai.provider.get_settings", lambda: Settings(_env_file=None, gemini_api_key=None))
    a=client_for(test_database,authenticated=False); b=client_for(test_database,authenticated=False)
    _,ar=register(a); _,br=register(b)
    model=simple_model()
    ap=a.post("/api/v1/projects",json={"name":"Private A","model":model}).json()
    bp=b.post("/api/v1/projects",json={"name":"Private B","model":model}).json()
    assert ap["user_id"]==ar.json()["user"]["id"] and bp["user_id"]==br.json()["user"]["id"]
    assert [p["id"] for p in a.get("/api/v1/projects").json()]==[ap["id"]]
    assert [p["id"] for p in b.get("/api/v1/projects").json()]==[bp["id"]]
    scenarios=[]; runs=[]
    for c,p in [(a,ap),(b,bp)]:
        sc=c.post(f"/api/v1/projects/{p['id']}/scenarios",json={"name":"Baseline","model":model}).json(); scenarios.append(sc)
        run=c.post(f"/api/v1/scenarios/{sc['id']}/runs",json={"include_timeline":True}); assert run.status_code==201
        runs.append(run.json())
    for c,p,sc,run,own in [(b,ap,scenarios[0],runs[0],bp),(a,bp,scenarios[1],runs[1],ap)]:
        pid=p['id']; sid=sc['id']; rid=run['id']
        probes=[('GET',f'/projects/{pid}',None),('PUT',f'/projects/{pid}',{'name':'Stolen'}),('DELETE',f'/projects/{pid}',None),
          ('GET',f'/projects/{pid}/runs',None),('POST',f'/projects/{pid}/runs',{}),
          ('GET',f'/projects/{pid}/scenarios',None),('POST',f'/projects/{pid}/scenarios',{'name':'Stolen','model':model}),
          ('GET',f'/scenarios/{sid}',None),('PUT',f'/scenarios/{sid}',{'name':'Stolen'}),('DELETE',f'/scenarios/{sid}',None),
          ('POST',f'/scenarios/{sid}/duplicate',{'name':'Stolen'}),('POST',f'/scenarios/{sid}/runs',{}),('GET',f'/runs/{rid}',None),
          ('POST',f'/projects/{own["id"]}/scenarios/compare',{'baseline_id':sid,'scenario_id':scenarios[0]['id']}),
          ('POST','/ai/explain-results',{'run_id':rid}),
          ('POST','/ai/explain-results',{'run_id':runs[1 if c is b else 0]['id'],'baseline_run_id':rid})]
        for method,path,body in probes:
            response=c.request(method,'/api/v1'+path,json=body)
            assert response.status_code==404, (method,path,response.text)
    assert a.get(f"/api/v1/projects/{ap['id']}").json()['name']=='Private A'
    assert b.get(f"/api/v1/projects/{bp['id']}").json()['name']=='Private B'
    assert a.post('/api/v1/projects',json={'name':'Forged','user_id':bp['user_id']}).status_code==400
    with Session(test_database) as db:
        legacy=Project(name='Legacy unowned'); db.add(legacy); db.commit(); legacy_id=legacy.id
    assert a.get(f'/api/v1/projects/{legacy_id}').status_code==404
    assert b.get(f'/api/v1/projects/{legacy_id}').status_code==404
