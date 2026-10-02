# Phase 19 — Testing and production hardening

Date: 1 October 2026. Tested locally on macOS with Python 3.14.7, PostgreSQL 17 in Docker, Next.js 16.3.7 and the Codex in-app browser. No new product features were added.

## Outcome

232 backend tests passed, including real PostgreSQL integration tests. All 10 frontend tests, frontend lint, TypeScript checking, backend lint and the optimized frontend build passed. Both application services started successfully; `/health` returned HTTP 200. No critical or high-severity issue remains known from this review. This is a local release check, not an external penetration test or a production load certification.

Evidence:

- [Backend test results](backend-test-results.xml), with individual test names and durations.
- [Simulation and HTTP measurements](performance-results.json).
- [Playback processing measurements](playback-performance-results.json).
- [Browser scenario comparison](phase19-workflow-verification.png).
- [Browser high-volume playback](phase19-high-volume-playback.png).

## Test report

| Test | Expected result | Actual result | Pass/Fail |
| --- | --- | --- | --- |
| Canonical model validation | Exactly six supported types; reject duplicate IDs, missing Source/Sink, invalid references, times, resources, distributions and routing probabilities | 37 schema tests passed; published JSON schema matches Pydantic | Pass |
| Source, Process, Sink and distributions | Predictable arrivals/service/completion; constant, exponential and uniform sampling; reproducible seeds | 11 core engine tests passed | Pass |
| Queue, Decision, Delay and full graphs | FIFO, finite/unlimited/zero waiting capacity, rejection, parallel resources, seeded branching and resource-free delays | 9 complete-node tests passed, including six-node hospital workflow | Pass |
| Disconnected nodes and cycles | Fail before simulation instead of ignoring unreachable work or looping | Cycles and nodes unreachable from every Source rejected; legitimate multiple Sources remain supported | Pass |
| Event ordering | Nondecreasing time; consistent lifecycle at equal timestamps | Backend event-order assertions and frontend timeline-order assertions passed | Pass |
| Metrics | Waiting/cycle time, throughput and utilization match manual calculations; queue length is time-weighted | 7 metric tests passed, including incomplete service at the horizon and rejected entities | Pass |
| Very low demand and no completions | Finite metrics; no invented cycle/service averages | One arrival over a 10,080-minute horizon completed; million-minute service produced zero completions and unavailable cycle averages | Pass |
| Extreme demand and saturation | Reject full queues; stop runaway entity/event generation | Queue tests passed; actual 10,000-entity and 200,000-event limits raised controlled errors | Pass |
| Many resources and long horizon | Correct counts and utilization within [0, 1] | 100 resources completed 10,000 entities; long-duration tests passed | Pass |
| Simulation REST API | Validation errors display clearly; `/run` equals the standalone engine | 21 simulation API tests passed, including unsupported input, safety limits and sanitized failures | Pass |
| PostgreSQL persistence | Projects, model versions and compact runs survive application restart | 4 persistence tests passed; browser project, both scenarios and run summaries also reloaded after an actual backend process restart | Pass |
| Alembic migrations | Upgrade and downgrade cleanly on an isolated database | All migrations downgraded to base and upgraded to head in a disposable test database; development records preserved | Pass |
| Authentication | Salted hashes, normalized email, session rotation/expiry/revocation and CSRF protection | Real PostgreSQL auth lifecycle, bad origin/token, expiration and throttle assertions passed | Pass |
| Authorization | Two users cannot access each other's project/scenario/run/comparison/AI sources | Full two-user isolation assertions passed, including changed IDs and caller-supplied ownership | Pass |
| Scenario management and comparison | CRUD/duplicate/run; consistent seed/duration; correct absolute and percentage differences | 5 backend scenario tests passed; browser duplicated and compared one versus three resources | Pass |
| Bottleneck detection | Deterministic evidence and ranking; no AI required | 10 tests passed; browser highlighted the one-Doctor constraint and showed no congestion with three Doctors | Pass |
| Optimization | Real repeated simulations, feasibility and cost ranking, bounded search | 35 tests passed; browser evaluated 9 runs with seeds 42/43/44 and recommended 2 Doctors at cost 200 for wait ≤ 5 minutes | Pass |
| AI generation validation | Reject/repair invalid graphs, unsupported output, oversized responses and timeouts within retry limits | 25 provider/validation tests passed; live Gemini returned a valid bank draft with arrivals 3, resources 2, service 5 and queue capacity 20 | Pass |
| AI explanation grounding | Only facts from authorized saved runs; no fabricated metrics or recommendations | 26 explanation tests passed; live comparison explanation reported 15→0 minutes waiting and 11→28 entities/hour from saved facts | Pass |
| AI unavailable | Manual simulation remains usable | Missing-key, provider failure and timeout tests preserved manual simulation | Pass |
| Starter templates | Every template validates and runs through the same engine | 12 template tests passed across Hospital, Bank, Restaurant, Warehouse and Customer-service center | Pass |
| Request and production safeguards | Bounded body size/time/concurrency; safe errors; invalid production settings fail startup | 24 hardening tests passed, including chunked body rejection, 408 timeout, 429 concurrency, secret-safe 500 and seed overflow | Pass |
| Browser editing and persistence | Create, connect, configure, save, refresh and recover graph/positions | Built Source→Queue→Doctor→Sink manually; saved/reloaded four nodes and three links with parameters intact | Pass |
| Browser analytics correctness | Changing capacity changes backend-derived metrics | 1 Doctor: 11 completions, wait 15 min, utilization 100%; 3 Doctors: 28 completions, wait 0 min, utilization 81.11% | Pass |
| Browser playback | Speed/pause/reset reuse a completed run; final counts match analytics | 312-event workflow finished with 11 completions; pause/reset worked; high-volume check described below | Pass |
| Protected frontend routes | Signed-out user redirected without private model contents | Logout followed by opening the project URL redirected to login; browser console reported no errors/warnings in the checked flow | Pass |
| Frontend automated tests | Layout, recommendation application and timeline behavior correct | 10 tests passed, including immutable model serialization and bounded event/marker work | Pass |
| Lint and type checking | No errors | ESLint with zero warnings, TypeScript and Ruff checks passed | Pass |
| Production build | All routes compile and generate successfully | Optimized Next.js build passed | Pass |
| Dependency audit | No known vulnerable installed dependencies | npm audit: 0 vulnerabilities; pip-audit: no known vulnerabilities in the audited environment (68 package entries) | Pass |
| Secret exposure | Gemini key stays out of source and public bundles | Exact-key scan found no matches in non-environment source/artifacts or built public JavaScript; ignored local environment files contain configuration | Pass |
| Local database network binding | Database port accessible only on this computer | Compose now publishes `127.0.0.1:5433` on this installation; container recreated with its existing volume and is healthy | Pass |

“Zero demand” requires care: the current Source always creates its first entity at time zero and accepts only positive interarrival times/entity limits. Zero generated entities is therefore not a configurable Source mode. Very low demand and zero completed entities are tested; unavailable averages remain null rather than fabricated zeros.

System waiting metrics describe completed entities; Queue waits describe entities that left the queue. These populations differ under congestion. The one-Doctor browser run correctly showed system mean wait 15 minutes and Queue mean wait 16.5 minutes. The simulation horizon is exclusive, so completion exactly at the horizon is excluded.

## Defects fixed

| Finding | Resolution |
| --- | --- |
| Unreachable nodes could be ignored | Execution graph validation now rejects nodes unreachable from every Source. |
| Unbounded incoming JSON bodies and simultaneous expensive requests | Added a counted 1 MiB body limit, ingress deadline and two-operation admission limit with controlled errors. |
| Missing elapsed execution guard | Added a cooperative 10-second simulation budget alongside entity/event caps. |
| Arbitrarily large names/IDs/coordinates | Bounded canonical IDs, labels and coordinates, and project descriptions. |
| Seed accepted values PostgreSQL INTEGER could not store | Restricted seeds to signed 32-bit integers; replication overflow fails before any candidate runs. |
| Production could retain HTTP cookie/CORS settings | Explicit production mode requires Secure cookies, a configured database and explicit HTTPS origins; configuration errors hide input values. |
| Unexpected failures could escape normal error handling | Middleware sanitizes pre-response failures, preserves CORS, and logs exception classes without private exception messages. |
| Session refresh could overwrite a newer login/logout | Request generation checks discard stale `/me` responses and their CSRF state. Ordinary login/reload/logout flows were browser-tested; the adversarial response race was code-reviewed. |
| Chart time labels displayed long floating-point values | Axis/tooltip formatting now rounds presentation only, retaining original simulation data. |
| Local PostgreSQL published to all network interfaces | Bound Compose port to loopback; retained the database volume. |
| Missing frontend lint gate and security headers | Added compatible Next.js ESLint configuration and commands, disabled powered-by header, and added browser security headers. |

## Performance measurements

Three runs per backend case; these are local observations, not service guarantees. HTTP timings include JSON serialization and transfer on localhost.

| Case | Events | Completed | Median engine time | Median HTTP time |
| --- | ---: | ---: | ---: | ---: |
| Hospital | 2,160 | 92 | 3.60 ms | — |
| Bank | 2,354 | 149 | 3.45 ms | 9.62 ms |
| Restaurant | 4,117 | 147 | 6.50 ms | — |
| Warehouse | 3,186 | 116 | 5.33 ms | — |
| Customer-service center | 2,871 | 150 | 4.17 ms | — |
| 10,000 entities / 100 resources | 110,000 | 10,000 | 258.06 ms | 276.57 ms |

The large HTTP response was 12,359,449 bytes. Request limits do not imply small responses: event timelines are transient and can be large. Instance memory and proxy response/timeout settings must accommodate the configured bounds.

The real 110,000-event log was replayed by the actual frontend timeline processor five times: median total processing 5.85 ms, 28 bounded advance calls, p95 per-call CPU 0.62 ms and maximum 1.68 ms. Each call consumed at most 4,000 events; marker output stayed at most 80. This Node.js measurement excludes React rendering and browser painting and is not an FPS claim.

The browser additionally ran and replayed a 150,000-event Source→Queue→Process→Sink model with 10,000 entities, 100 resources, constant arrival 0.01 minute, service 0.001 minute and a 120-minute horizon. At 20× playback, the log completed with the same 10,000 completions and zero rejections. Controls and reset remained responsive. This is a browser smoke test; no browser frame-time percentile is claimed.

## Enforced limits

| Boundary | Limit |
| --- | --- |
| HTTP request body | 1 MiB, including chunked bodies |
| Request body receipt | 10 seconds total |
| Concurrent run/optimization requests | 2 per backend process; excess requests get 429 with Retry-After |
| API graph | 100 nodes / 300 edges |
| API duration | 10,080 simulated minutes |
| API Process resources | 100 per Process |
| Generated entities | 10,000 total per run |
| Logged events | 200,000 per run |
| Simulation wall time | 10 seconds, checked every 1,024 events and after metrics computation |
| Grid search | 25 distinct configurations including baseline / 100 simulation runs / 1–10 replications / 30-second cooperative budget |
| Seeds | Signed 32-bit range; replication seeds must fit |
| AI description | 10–6,000 characters |
| AI attempts | At most 3, provider timeout 30 seconds, overall operation budget 95 seconds; bounded provider output |
| Authentication attempts | 30 per IP/minute/process; bounded address tracking |
| Session lifetime | 1–168 hours; default 24 |
| Playback work/output | 4,000 events per advance; at most 80 active markers and 80 transfer markers |

Execution budgets are cooperative checks, not operating-system preemption. Optimizer elapsed checks occur before and after each bounded simulation. Admission and login limits are process-local and reset on restart; public ingress must apply aggregate request/rate limits before multiple workers are used.

## Security review and deployment conditions

- Argon2id password hashing; opaque HttpOnly/SameSite sessions backed by hashed session tokens in PostgreSQL; server expiry and logout revocation. No JWT or session token in localStorage.
- Every owned resource is checked on the backend. SQLAlchemy parameterized queries and owner filters prevent ID substitution and SQL injection; an injection-shaped project name was stored as data.
- Unsafe authenticated requests require CSRF and allowed browser origins. Explicit CORS origins, production Secure cookies and HTTPS checks fail closed. Frontend guards supplement backend authorization.
- Unexpected failures return generic JSON; no raw traces, provider details or credentials are sent to clients. Private API responses have `Cache-Control: no-store`.
- Gemini credentials remain server-side. Generated data passes canonical Pydantic, executable graph and limits validation. Explanation selection is constrained to evidence from authorized saved runs; user text and names cannot add arbitrary facts. No provider output is executed as code.
- Use `ASTRA_ENVIRONMENT=production`, `ASTRA_COOKIE_SECURE=true`, an explicit HTTPS frontend origin and the deployment database URL. Serve the frontend and API on the same site for the current cookie strategy. Apply migrations before serving traffic.
- Use HTTPS ingress, database credentials with only application permissions, backups and appropriate aggregate limits. Local Compose is a development database configuration, not a public database deployment. Actual hosting is a later phase.
- The workspace currently has no Git metadata, so Git history could not be audited. Environment files are excluded by the repository ignore rules; the file and public-bundle scans found no configured Gemini key outside local environment configuration.
- Dependency audits are point-in-time checks. Re-run before release. ESLint 9 is retained because the current Next.js lint plugins fail with ESLint 10; npm reports the older development tool as unsupported. The application build/lint passes and the audit reports zero known vulnerabilities. Update the lint tool when its plugins support the newer version.
- Starlette emits one test-only deprecation warning about its `httpx` TestClient transport. It does not fail tests or affect the Gemini transport; migration to the replacement test transport can follow upstream compatibility work.

## Reproduce

With local environment files configured and PostgreSQL running, from `backend/`:

```sh
python -m pip install -e '.[dev]'
python -m pytest -q --junitxml=../docs/backend-test-results.xml
ruff check app tests scripts
pip-audit
python -m scripts.benchmark --api-url http://127.0.0.1:8000
```

Use the activated virtual environment. PostgreSQL tests create uniquely named disposable databases and require a local test database role with database creation permission. Their downgrade tests never target the normal development database. The optional HTTP benchmark creates and signs out a synthetic test account.

From `frontend/`:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit
node scripts/benchmark-playback.cjs
```

Run the backend benchmark first to write the transient timeline at `/tmp/astra-phase19-timeline.json`. Browser verification used synthetic accounts and test projects, preserving existing user models. Browser timelines deliberately disappear on reload; compact saved analytics and scenario runs survive restart.
