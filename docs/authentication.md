# Authentication and ownership (Phase 17)

## Setup

Install the backend dependencies and run `alembic upgrade head` from `backend/`. The migration adds nullable password hashes for existing legacy users, a session table and an ownership index. No existing model or run is deleted.

Set `ASTRA_COOKIE_SECURE=false` only for local HTTP development. Set it to `true` for HTTPS deployments. `ASTRA_SESSION_HOURS` defaults to 24. Frontend and API must use the same hostname locally (both `localhost`, or both `127.0.0.1`); cookies are host scoped. The current cookie strategy supports a same-site frontend/API deployment. Cross-site deployment requires a deliberate cookie/CSRF configuration review.

## API

- `POST /api/v1/auth/register`: email, display_name, password; creates an account and a session.
- `POST /api/v1/auth/login`: email, password; creates a fresh session, revoking the session presented in the request.
- `GET /api/v1/auth/me`: current user and session CSRF token.
- `POST /api/v1/auth/logout`: revokes the presented session and clears its cookie.

Register/login return `{user: {id, email, display_name}, csrf_token}`. Email is normalized to lowercase; passwords are 12–128 characters and are never trimmed. Passwords use salted Argon2id hashes through argon2-cffi, with rehashing on login when parameters change. Legacy users with no hash cannot log in.

Sessions use random 256-bit opaque tokens in host-only HttpOnly, SameSite=Lax cookies, with optional Secure for HTTPS. Only the SHA-256 digest of the session token is stored in PostgreSQL. Sessions expire server-side and survive backend restarts. Login issues fresh tokens; logout prevents reuse of copied old cookies. Expired sessions are cleaned during session creation. No bearer token, password or session token is stored in localStorage.

All application API routes except auth entry points and health require authentication, including transient simulations, optimization and AI. Browser requests include credentials. Unsafe authenticated requests require `X-Astra-CSRF`, matched to a separate random token in the session, and reject origins outside the configured CORS list. Register/login reject unapproved browser origins. The CSRF token is retrieved via /me after refresh and kept in frontend memory. CORS is not the authorization boundary.

Authentication entry points have a bounded per-IP limit of 30 attempts/minute in each backend process. It ignores untrusted forwarded IP headers. Production ingress must enforce shared rate limits before scaling to multiple workers; in-process counters reset on restart. Missing users and wrong passwords use the same login error and both verify an Argon2 hash. Registration duplicates return a generic conflict message.

## Ownership

New projects always receive the authenticated user's ID. Caller-supplied ownership is forbidden. Every project read/update/delete/run/version selection is scoped to that owner. Scenarios, model versions and runs inherit ownership through their project, avoiding duplicate owner fields that could diverge. Direct scenario/run lookup joins the owner project, and comparisons and AI explanations check each referenced resource, including baseline runs. Missing and foreign IDs both return 404.

Existing prototype projects with `user_id=NULL` are preserved but inaccessible to every account. Registration does not claim them. They must be assigned to a chosen existing user by an explicit administrator database operation; automatic first-user ownership would expose old data to an arbitrary registrant. No public claim endpoint is provided.

## Frontend

Register and sign in at `/register` and `/login`. `/dashboard`, `/projects` and `/simulator` wait for session verification before mounting their content and redirect anonymous visitors to login. The original local destination is restored after login. Backend ownership enforcement remains authoritative even if the frontend guard is bypassed. Logout clears account context and unmounts protected content. Unauthorized API responses clear the context, and focusing the window checks whether a session was revoked elsewhere. No private model is embedded by the page's server component.

## Verification

PostgreSQL tests create two distinct real users and check isolation for project CRUD, list/history, scenario creation/load/update/delete/duplicate/run, direct run IDs, cross-project comparisons, and both source/baseline IDs in AI explanations. They also cover anonymous application routes, ownership injection, legacy unowned projects, password hashes, session rotation, revocation, restart reads, expiration, bad credentials, duplicate email normalization, CSRF, foreign origins and throttling. Existing simulation tests explicitly stub authentication to keep testing domain behavior; storage and authentication tests use real sessions.

Sources: [argon2-cffi API](https://argon2-cffi.readthedocs.io/en/stable/api.html), [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

Live browser verification also covered registration, logout redirect, login restoring the private project page, and an inaccessible legacy project ID showing “Project not found” with an empty canvas. The verification account was signed out afterward. Screenshot: `phase17-authentication-verification.png`.
