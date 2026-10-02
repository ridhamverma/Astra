# Astra

**Model. Simulate. Improve.**

Astra is a browser-based platform for visual discrete-event simulation of process-flow and queue-based operations. The repository contains the full-stack foundation, universal simulation model schema, standalone engine for all six node types, and PostgreSQL project and run storage. AI and optimization behavior are not implemented yet.

## Prerequisites

- Node.js 20.9 or newer and npm
- Python 3.11 or newer
- Docker Desktop with Docker Compose, for the local PostgreSQL database

## Environment setup

Copy `.env.example` to `.env` at the repository root and replace `POSTGRES_PASSWORD` with a unique local password. Copy `backend/.env.example` to `backend/.env` and put the same credentials in `ASTRA_DATABASE_URL`. Copy `frontend/.env.example` to `frontend/.env.local` if the API is not at the default `http://localhost:8000`.

The example values are local placeholders. Do not commit actual secrets. Environment files other than examples are ignored by Git.

## Database startup

From the repository root:

```bash
docker compose up -d postgres
docker compose ps
```

PostgreSQL listens on the `POSTGRES_PORT` from `.env` (default 5432). Its data is stored in the `postgres_data` Docker volume. Apply migrations from `backend/` before using project APIs:

```bash
source .venv/bin/activate
alembic upgrade head
alembic current
```

New schema changes should be added as Alembic revisions; the API does not create tables at startup. `alembic check` compares the current models with the migrated database.

## Backend installation and development

From `backend/`:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000/health`. It should return `{"status":"ok","service":"astra-backend"}`. Run the backend checks with:

```bash
python -m pytest
python -c 'import app.main; print("Backend imports OK")'
```

`ASTRA_CORS_ORIGINS` in `backend/.env` controls allowed frontend origins. The examples include localhost and 127.0.0.1 on port 3000.

## Frontend installation and development

From `frontend/`:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The visual builder is at `/simulator`; saved projects can be reopened from `/projects`. The home and dashboard pages remain placeholders. Check types and production compilation with:

```bash
npm run typecheck
npm run build
```

## Repository layout

- `frontend/app`: Next.js App Router pages and global styling
- `frontend/components`, `lib`, `services`, `stores`, `types`: shared frontend code as features arrive
- `backend/app/api`: HTTP routes
- `backend/app/schemas`: Pydantic schemas
- `backend/app/simulation`: standalone simulation engine and metrics
- `backend/app/models`, `database`: SQLAlchemy persistence and sessions
- `backend/alembic`: PostgreSQL migrations
- `backend/app/ai`, `optimization`: reserved for later phases
- `backend/tests`: backend checks
- `docs`: architecture and future project notes

The simulation engine is separate from the API and can be called directly from Python.

## Universal simulation model

The canonical Pydantic model is in `backend/app/schemas/simulation.py`, with matching frontend types in `frontend/types/simulation.ts`. See `docs/README.md` for field meanings and validation rules. Machine-readable JSON Schema and simple, bank, and hospital examples are under `docs/`.

## Simulation engine

The SimPy engine executes acyclic Astra graphs containing Source, Queue, Process, Decision, Delay, and Sink nodes. From `backend/`, after installation:

```python
import json
from pathlib import Path

from app.simulation import simulate

model = json.loads(Path("../docs/examples/simple.json").read_text())
result = simulate(model)
print(result.summary.model_dump())
```

The result contains summary metrics, Process and Queue metrics, chart-ready time series, entities, and an event log. `result.model_dump()` uses the wire keys `simulationId`, `nodeMetrics`, and `timeSeries`. See `docs/README.md` for metric formulas and timing rules. Run all backend tests with `.venv/bin/python -m pytest` from `backend/`.

## Simulation REST API

FastAPI exposes `POST /api/v1/simulations/validate` and `POST /api/v1/simulations/run`. Both accept the canonical model JSON. Validation returns `{"valid": true, "errors": []}` for an executable model or field-level errors for invalid input. Run returns the same structured result as `simulate(model)`.

With the backend running, for example:

```bash
curl -X POST http://localhost:8000/api/v1/simulations/validate \
  -H 'Content-Type: application/json' \
  --data-binary @docs/examples/simple.json
```

Run this command from the repository root. See `docs/README.md` for API limits and error codes.

## Project and run persistence

Projects store a name, optional description, timestamps, and optionally a validated Astra model. A model supplied at creation becomes version 1; sending `model` in a `PUT` creates the next immutable version. A `PUT` can also update the name or description without changing the model. Runs use the latest model version unless `model_version` is specified. The run record stores seed, duration, summary, node metrics, and lightweight chart series as JSONB. Event logs are returned by the standalone simulation API but are not kept in run history.

Available routes:

```text
GET    /api/v1/projects
POST   /api/v1/projects
GET    /api/v1/projects/{id}
PUT    /api/v1/projects/{id}
DELETE /api/v1/projects/{id}
POST   /api/v1/projects/{id}/runs
GET    /api/v1/projects/{id}/runs
GET    /api/v1/runs/{runId}
```

For example, from the repository root after starting the backend:

```bash
curl -X POST http://localhost:8000/api/v1/projects \
  -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json; print(json.dumps({"name": "Simple service", "model": json.load(open("docs/examples/simple.json"))}))')"
```

Then send `POST /api/v1/projects/{id}/runs` with `{}` to run the latest version. `GET /api/v1/projects/{id}` and `GET /api/v1/runs/{runId}` read the saved records after restarting the backend. Authentication is a later phase; `user_id` remains nullable for now.

The PostgreSQL integration tests create and remove an isolated temporary database. With the database running and `ASTRA_DATABASE_URL` configured, run `.venv/bin/python -m pytest` from `backend/` to include them. They skip when no database URL is configured.

## Visual simulation builder

Open `/simulator` to drag Source, Queue, Process, Decision, Delay, and Sink blocks onto a React Flow canvas. Drag from a block's right handle to another block's left handle to connect them. Nodes can be moved and selected; selected nodes or edges can be deleted with Delete/Backspace or the Properties panel. The canvas supports zoom, pan, fit view, and a minimap. Click a palette item to add it at the canvas center.

Each block starts with a valid default configuration. The builder converts React Flow nodes and edges into the same canonical `SimulationModel` used by the backend; it stores graph coordinates and connections through the project API. Save a connected model to create a project, then use `/projects` to reopen it after refresh. The Properties panel edits node names and configuration, including arrival distributions, queue capacity, Process resources and service times, Decision routing probabilities and Delay times.

Run Simulation sends the current graph to the validation API, saves pending changes as a model version, then executes a persisted backend run. The Analytics tab displays six system metrics, Queue and Process metrics, and Recharts views of Queue length, cumulative completions, and resource utilization. The latest run can be reopened after a refresh. All displayed values come from backend metrics or event-derived series; the charts only format them for display.

The backend validates saved graphs. For example, a model needs a Source and Sink, and non-Decision nodes can have only one outgoing link. Validation messages appear above the canvas when a save or run cannot complete.

For a reproducible capacity check, use `docs/examples/doctor-capacity.json`: run it with one Doctor, then change that Process's Resources field to 3 and run again. The same duration and seed make the waiting time, throughput, and utilization change attributable to capacity.

### Animated playback

After a simulation finishes, open **Playback** to play, pause, reset, or select
1×/5×/10×/20× speed. Playback reuses the completed run without another backend
request. Timelines are kept in browser memory until reload or the next run.
See [playback architecture and verification](docs/playback.md).

### Scenario experiments

Use **Scenarios & Compare** to create a baseline, duplicate it, edit resources,
run each configuration, and compare measured results. Snapshots and compact runs
are stored in PostgreSQL. Comparisons require matching duration and seed and
current snapshot runs. Apply migrations after upgrading the backend.
See [scenario workflow, API, and comparison formulas](docs/scenarios.md).

### Bottleneck analysis

Analytics now ranks Process bottleneck candidates from utilization, resource wait,
and directly upstream Queue measurements. The primary candidate is highlighted
on a matching canvas, with numerical evidence and scoring details. Analysis also
works on saved runs without rerunning them, and uses no AI service.
See [the scoring method, limitations, and tests](docs/bottlenecks.md).

## AI model generation

The Simulator's **Generate Model** tab converts descriptions into validated, editable drafts. Configure the optional `ASTRA_GEMINI_API_KEY` in `backend/.env` and restart the backend. Review all parameters and assumptions before importing; drafts never run automatically. Manual editing and simulation work without an AI key. See [AI setup, validation and test prompts](docs/ai-model-generation.md).

## AI result explanations

After a run, use **Explain these results** in Analytics or scenario comparison. The backend loads saved metrics and returns an explanation with inspectable evidence. AI selects supported observations; it cannot change numbers, determine bottlenecks, invent costs or run simulations. Provider outages leave the application usable. See [grounding method and API contract](docs/ai-result-explanations.md).

## Operational optimization

Use the Simulator's **Optimization** tab to grid-search a Process resource count. Every candidate is evaluated by real repeated simulations with controlled seeds. Set a metric target, an optional limit on additional resources, and optionally minimize configured resource cost. Review the tested candidates and rationale before applying to the builder. See [optimizer API, ranking, cost semantics and limits](docs/optimization.md).

## Accounts and private projects

After updating backend dependencies, run `alembic upgrade head`. Create your account at `/register`, then sign in to use Dashboard, Projects and Simulator. Projects, scenarios and saved runs are private to their owner; all application APIs require a session. Logout revokes the session on the server.

Existing prototype projects without an owner are preserved but hidden from all accounts until ownership is explicitly assigned by an administrator. For session settings, CSRF requirements and isolation tests, see [authentication and ownership](docs/authentication.md). Use `ASTRA_COOKIE_SECURE=true` with HTTPS in production.

## Simulation templates

In **Projects**, choose **New Blank Project** or **Create From Template**. Hospital, Bank, Restaurant, Warehouse and Customer-service center starters create normal editable projects with saved canonical graphs. Click Run Simulation to measure them using Astra's existing engine. See [starter configurations and verification](docs/templates.md).

## Testing and production hardening

Phase 19 verifies the engine, APIs, PostgreSQL migrations, authentication, ownership,
scenarios, optimization, AI validation and browser workflows. See the
[testing report](docs/testing-report.md) for results, measured performance,
enforced limits and deployment conditions.

With the backend virtual environment activated, install development tools with
`python -m pip install -e '.[dev]'`, then run `python -m pytest` and
`ruff check app tests scripts` from `backend/`. Database tests require running
PostgreSQL and create disposable test databases. From `frontend/`, run
`npm run lint`, `npm run typecheck`, `npm test` and `npm run build`.

Set `ASTRA_ENVIRONMENT=production` for deployment. Production startup requires
`ASTRA_COOKIE_SECURE=true`, a database URL and explicit HTTPS CORS origins. Use a
same-site frontend/API deployment and apply Alembic migrations before serving
traffic. For a single backend process without development reload:

```sh
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --limit-concurrency 16 --timeout-keep-alive 5
```

Place public traffic behind HTTPS ingress with aggregate rate limits. Simulation
admission and authentication throttling are process-local. The Compose PostgreSQL
port binds to `127.0.0.1` for local development.

## Production deployment

Phase 20 prepares Astra for production public deployment.

```
                    ┌────────────────────────────┐
                    │      Next.js Frontend      │
                    │   (Vercel / Cloudflare)    │
                    └──────────────┬─────────────┘
                                   │  HTTPS + Credentials
                                   ▼
                    ┌────────────────────────────┐
                    │      FastAPI Backend       │
                    │   (Render / Railway / Fly) │
                    └──────────────┬─────────────┘
                                   │  SSL
                                   ▼
                    ┌────────────────────────────┐
                    │     Managed PostgreSQL     │
                    │  (Neon / Supabase / RDS)   │
                    └────────────────────────────┘
```

### 1. Frontend deployment (Vercel)

Astra's frontend is an optimized Next.js App Router application.

1. **Import repository to Vercel**:
   - Set **Root Directory** to `frontend`.
   - Framework Preset is automatically detected as **Next.js**.
   - Build Command: `next build` (or `npm run build`).
   - Output Directory: `.next`.
2. **Configure Environment Variables in Vercel**:
   - `NEXT_PUBLIC_API_URL`: Your deployed backend public URL, e.g. `https://astra-backend.onrender.com` (or `NEXT_PUBLIC_API_BASE_URL`).
3. **Deploy**:
   - Trigger deployment. `frontend/vercel.json` provides standard platform presets.

### 2. Backend deployment (Docker / Render / Railway / Fly)

The backend is packaged as a lightweight, multi-stage Docker container running Python 3.12-slim and Uvicorn as an unprivileged `astra` user (UID 10001).

1. **Docker Container**:
   Build and test the container locally:
   ```bash
   docker build -t astra-backend ./backend
   docker run -p 8000:8000 \
     -e DATABASE_URL="postgresql://user:pass@host:5432/astra" \
     -e ASTRA_ENVIRONMENT="production" \
     -e ASTRA_COOKIE_SECURE="true" \
     -e ASTRA_COOKIE_SAMESITE="none" \
     -e CORS_ORIGINS="https://your-astra.vercel.app" \
     astra-backend
   ```
2. **Deploy on Render**:
   - Astra includes a root `render.yaml` Blueprint specification.
   - In Render, click **New > Blueprint** and connect this repository.
   - It automatically provisions:
     - A managed PostgreSQL 17 database (`astra-postgres`).
     - A Docker web service for the FastAPI backend (`astra-backend`) with health checks at `/health`.
     - Optional Node web service for frontend (or deploy frontend on Vercel).
3. **Deploy on Railway / Fly.io / AWS ECS**:
   - Point the service to `backend/Dockerfile`.
   - Set environment variables as documented below.
   - Configure health check path to `/health` (or `/health/ready`).

### 3. Database configuration (Managed PostgreSQL)

Astra supports any managed PostgreSQL database (e.g., Neon, Supabase, Render Postgres, AWS RDS, Railway):

- Connection string format: Astra accepts `postgresql://`, `postgres://`, or `postgresql+psycopg://`. Cloud database URLs starting with `postgres://` are automatically normalized to `postgresql+psycopg://`.
- SSL mode: Managed cloud databases requiring SSL (e.g. `?sslmode=require`) work seamlessly.
- Connection pooling: SQLAlchemy uses `pool_pre_ping=True` to automatically drop stale connections and survive cloud database sleep/wake cycles.

### 4. Database migrations

Database migrations are managed via Alembic:

- **Automatic migrations**: The backend Docker image (`backend/docker-entrypoint.sh`) automatically runs `alembic upgrade head` before booting the Uvicorn web server when `RUN_MIGRATIONS=true` (default).
- **Manual migration command**:
  ```bash
  # From backend/ with virtualenv activated
  alembic upgrade head
  alembic current
  ```
- **Migration check**:
  ```bash
  alembic check
  ```

### 5. Environment variables reference

All production environment variables support standard cloud provider aliases:

| Variable | Cloud Alias | Required in Prod | Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `ASTRA_DATABASE_URL` | `DATABASE_URL` | **Yes** | — | PostgreSQL connection string (`postgresql://...`) |
| `ASTRA_ENVIRONMENT` | `ENVIRONMENT` | **Yes** | `development` | Set to `production` in live environments |
| `ASTRA_COOKIE_SECURE` | `COOKIE_SECURE` | **Yes** (in prod) | `false` | Must be `true` behind HTTPS |
| `ASTRA_COOKIE_SAMESITE`| `COOKIE_SAMESITE`| Conditional | `lax` | Set to `none` if frontend and backend use different domains |
| `ASTRA_CORS_ORIGINS` | `CORS_ORIGINS` | **Yes** (in prod) | Localhost list | Allowed frontend HTTPS URL(s); JSON list or comma-separated string |
| `ASTRA_GEMINI_API_KEY`| `AI_API_KEY` | Optional | — | Google Gemini API key for AI model generation & explanations |
| `ASTRA_GEMINI_MODEL` | `GEMINI_MODEL` | Optional | `gemini-3.1-flash-lite` | Gemini model name |
| `ASTRA_JWT_SECRET` | `JWT_SECRET` | Optional | — | Application secret token (opaque DB sessions used by default) |
| `ASTRA_SESSION_HOURS` | `SESSION_HOURS` | No | `24` | Session cookie validity period in hours |
| `NEXT_PUBLIC_API_URL` | `NEXT_PUBLIC_API_BASE_URL` | **Yes** (frontend) | `http://localhost:8000` | Frontend backend API base URL |
| `RUN_MIGRATIONS` | — | No | `true` | Executes `alembic upgrade head` on container entrypoint |
| `PORT` | — | No | `8000` | Port listened by the backend container (injected by PaaS) |

> [!CAUTION]
> Never commit `.env` or `.env.local` files containing real production passwords or API keys to version control.

### 6. Health and readiness checks

Astra exposes dual probe endpoints for container orchestrators and uptime monitoring:

- **Liveness Probe**: `GET /health`
  - Returns HTTP 200 `{"status": "ok", "service": "astra-backend"}`.
  - Lightweight process check that does not touch external dependencies.
- **Readiness Probe**: `GET /health/ready` (or `GET /api/v1/health`)
  - Executes a `SELECT 1` ping against the PostgreSQL database.
  - Returns HTTP 200 `{"status": "ready", "database": "connected", "environment": "production", "ai_enabled": true}`.
  - Returns HTTP 503 if the database is unreachable, preventing traffic routing to unready instances.

### 7. Verified end-to-end deployed workflow

The entire deployed lifecycle is verified by automated integration tests (`tests/test_e2e_workflow.py`):

1. **Register** (`POST /api/v1/auth/register`) — User creates an account with Argon2id password hashing.
2. **Login** (`POST /api/v1/auth/login`) — Issues secure session cookie and CSRF token.
3. **Create Project** (`POST /api/v1/projects`) — Instantiates project with owner isolation.
4. **Build Model** — Canvas layout with Source, Queue, Process, Decision, Delay, and Sink nodes.
5. **Save** (`PUT /api/v1/projects/{id}`) — Persists model version 2.
6. **Run Simulation** (`POST /api/v1/projects/{id}/runs`) — SimPy engine executes discrete-event simulation.
7. **View Analytics** (`GET /api/v1/runs/{runId}`) — Throughput, waiting times, and utilization metrics.
8. **Replay** (`POST /api/v1/simulations/run`) — Chronological event playback timeline.
9. **Create Scenario** (`POST /api/v1/projects/{id}/scenarios`) — Baseline and modified capacity snapshots.
10. **Compare** (`POST /api/v1/projects/{id}/scenarios/compare`) — Side-by-side metric delta calculations.
11. **AI Generate Model** (`POST /api/v1/ai/generate-model`) — Natural language to canonical schema generation.
12. **Detect Bottleneck** — Deterministic scoring and ranking of congested process stages.
13. **Optimize** (`POST /api/v1/optimize`) — Bounded parameter search recommending optimal resource configuration.

### 8. Troubleshooting

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| **`403 Request origin is not allowed`** | Origin mismatch in CORS | Set `ASTRA_CORS_ORIGINS` (or `CORS_ORIGINS`) to include your exact frontend URL (e.g. `https://your-astra.vercel.app`) without trailing slash. |
| **Session cookie lost on next request** | Cross-site `SameSite=Lax` blocking | If frontend is on `vercel.app` and backend is on `onrender.com`, set `ASTRA_COOKIE_SAMESITE=none` and `ASTRA_COOKIE_SECURE=true`. |
| **`500 Internal server error` on startup** | Production settings validation | In production (`ASTRA_ENVIRONMENT=production`), Astra strictly requires `ASTRA_COOKIE_SECURE=true`, a valid `DATABASE_URL`, and HTTPS CORS origins. |
| **`Database check failed` / 503 on `/health/ready`** | Cloud PostgreSQL unreachable or sleeping | Verify database credentials; ensure connection string includes `?sslmode=require` if required by provider (Neon/Supabase). |
| **AI generation returns `503 Service Unavailable`** | Missing or invalid Gemini API key | Supply a valid Gemini API key via `ASTRA_GEMINI_API_KEY` (or `AI_API_KEY`). Manual builder and simulation continue to work without AI. |
| **`429 Simulation capacity is busy`** | Concurrency safety limit | Astra limits simultaneous heavy simulation requests per process to protect CPU resources. Upstream ingress should scale horizontally or retry shortly. |

## Free College Project Deployment

Astra is configured for 100% free deployment for college presentations, portfolio demonstrations, and professor evaluations. **Expected monthly cost: ₹0 / $0.**

```
                          ┌──────────────────────────────────────┐
                          │         Vercel (Hobby Tier)          │
                          │        Next.js App Router UI         │
                          │      Cost: ₹0 · No card needed       │
                          └──────────────────┬───────────────────┘
                                             │ HTTPS (Credentials)
                                             ▼
                          ┌──────────────────────────────────────┐
                          │          Render (Free Tier)          │
                          │     FastAPI + SimPy Engine Docker    │
                          │      Cost: ₹0 · No card needed       │
                          └──────────┬────────────────┬──────────┘
                                     │ SSL            │ Gemini API
                                     ▼                ▼
┌──────────────────────────────────────┐    ┌───────────────────────────────────┐
│       Neon Serverless Postgres       │    │     Google AI Studio (Gemini)     │
│       PostgreSQL 17 (0.5 GB)         │    │     Free Tier (15 RPM quota)      │
│      Cost: ₹0 · No card needed       │    │     Cost: ₹0 · No card needed     │
└──────────────────────────────────────┘    └───────────────────────────────────┘
```

### Free Providers Selected

| Role | Provider | Plan | Cost | Card Required? | Free-Tier Limits |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **Frontend** | [Vercel](https://vercel.com) | Hobby | ₹0 / $0 | **No** | 100 GB bandwidth, unlimited deployments |
| **Backend** | [Render](https://render.com) | Free Web Service | ₹0 / $0 | **No** | 512 MB RAM, sleeps after 15m idle, 750 free hours/month |
| **Database** | [Neon](https://neon.tech) | Free Tier | ₹0 / $0 | **No** | 0.5 GB storage, serverless PostgreSQL 16/17, auto-suspends |
| **AI** | [Google AI Studio](https://aistudio.google.com) | Free Quota | ₹0 / $0 | **No** | 15 RPM, 1,500 requests/day, HTTP 429 when throttled |
| **Source** | [GitHub](https://github.com) | Free | ₹0 / $0 | **No** | Unlimited public/private repositories |

### Why This Stack Cannot Incur Accidental Charges

1. **Zero credit card requirement**: None of the selected providers require credit card information to sign up and run the application.
2. **Hard-limit throttling**: If free bandwidth or AI quotas are exceeded, providers respond with rate limits or temporary suspension rather than automatic billing.
3. **No expiring free trials**: Unlike AWS RDS or Azure trials that expire and convert to paid billing, Vercel, Render Free, and Neon Free are persistent free tiers.

### Step-by-Step Deployment Guide for Students

Follow these exact steps to deploy your own copy of Astra completely free:

#### 1. Push code to GitHub
```bash
git init
git branch -M main
git add .
git commit -m "feat: complete Astra deployment setup"
# Create a repository on github.com, then:
git remote add origin https://github.com/<your-username>/<your-repo-name>.git
git push -u origin main
```

#### 2. Create Free Managed PostgreSQL Database on Neon
1. Go to [neon.tech](https://neon.tech) and sign up with GitHub or Google (no card required).
2. Click **Create Project**, name it `astra-db`, and select PostgreSQL 17 in your closest region.
3. In the project dashboard, copy the **Connection string** (select `psql` or `Connection string` mode). It looks like:
   ```text
   postgresql://user:password@ep-cool-fog-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

#### 3. Run Initial Migrations
Run Alembic migrations once from your terminal to initialize all PostgreSQL tables:
```bash
cd backend
# Set DATABASE_URL in your terminal session
export DATABASE_URL="postgresql://user:password@ep-cool-fog-123456.us-east-2.aws.neon.tech/neondb?sslmode=require"
.venv/bin/alembic upgrade head
```
*(Alternatively, the backend container automatically applies migrations on its first boot!)*

#### 4. Deploy Backend on Render (Free Web Service)
1. Go to [render.com](https://render.com) and sign up with GitHub (no card required).
2. Click **New > Web Service** and select your GitHub repository.
3. Configure the service:
   - **Name**: `astra-backend`
   - **Language / Runtime**: **Docker**
   - **Dockerfile Path**: `backend/Dockerfile`
   - **Docker Context**: `backend`
   - **Instance Type**: **Free** ($0/month, 512 MB RAM)
4. Add **Environment Variables**:
   - `ASTRA_ENVIRONMENT`: `production`
   - `ASTRA_COOKIE_SECURE`: `true`
   - `ASTRA_COOKIE_SAMESITE`: `none`
   - `DATABASE_URL`: Your Neon connection string from Step 2
   - `ASTRA_CORS_ORIGINS`: Temporary placeholder `http://localhost:3000` (updated in Step 6)
   - `ASTRA_GEMINI_API_KEY`: Your key from [aistudio.google.com](https://aistudio.google.com) (free, optional)
   - `ASTRA_GEMINI_MODEL`: `gemini-3.1-flash-lite`
5. Click **Create Web Service**. Wait for the build to finish.
6. Copy your public backend URL, e.g.:
   `https://astra-backend.onrender.com`

#### 5. Deploy Frontend on Vercel
1. Go to [vercel.com](https://vercel.com) and sign up with GitHub (no card required).
2. Click **Add New > Project** and import your repository.
3. Configure settings:
   - **Root Directory**: `frontend`
   - **Framework Preset**: `Next.js`
4. Expand **Environment Variables**:
   - `NEXT_PUBLIC_API_URL`: Your Render backend URL from Step 4 (e.g. `https://astra-backend.onrender.com`)
5. Click **Deploy**. Vercel will build and assign a URL:
   `https://<your-project>.vercel.app`

#### 6. Connect CORS Origins
1. Return to your Render backend dashboard: **Settings > Environment Variables**.
2. Update `ASTRA_CORS_ORIGINS` to include your Vercel URL:
   ```text
   https://<your-project>.vercel.app,http://localhost:3000
   ```
3. Save changes. Render will automatically redeploy with CORS active.

### Handling Free-Tier Sleeping & Cold Starts

> [!NOTE]
> **What your professor should know during an evaluation:**
>
> Render's free tier automatically spins down the backend container after 15 minutes without requests.
> When a request arrives, Render spins up the container automatically.
> The initial "wake up" takes **30–50 seconds**. All subsequent requests are fast (~10–50 ms).
>
> **Tip for presentations:**
> 2 minutes before demonstrating the project to your professor, open the backend health check in a browser tab (`https://astra-backend.onrender.com/health`). Once it loads `{"status":"ok"}`, the backend is awake and ready for instantaneous live demos!

### How to Redeploy
- Every `git push origin main` automatically triggers a zero-downtime rebuild on Vercel (frontend) and Render (backend).

## Demo URLs

- **Frontend**: `https://astra-frontend.vercel.app` *(or localhost:3000 in dev)*
- **Backend API**: `https://astra-backend.onrender.com` *(or localhost:8000 in dev)*
- **Liveness Health Check**: `https://astra-backend.onrender.com/health`
- **Database Readiness Probe**: `https://astra-backend.onrender.com/health/ready`


