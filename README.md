# Code Intelligence Platform

A knowledge-graph/GraphRAG code intelligence platform. Create an application
pointing at a GitLab repository, watch it get indexed in real time, then
ask natural-language questions and get grounded answers with clickable
source citations and graph evidence. See
[PROJECT_REQUIREMENTS.md](./PROJECT_REQUIREMENTS.md) for the full spec.

```
React (frontend/)  ->  Node.js (backend/)  ->  Python (code-intelligence/)  ->  Postgres (Apache AGE graph + pgvector + plain tables)
```

- **frontend/** — React 19 + JavaScript (Vite, React Router, TanStack Query, d3-force for the graph view). Presentation only; talks only to the Node backend, never to Python, GitLab, or Postgres directly. Includes an in-app **Instructions** page (sidebar → Instructions) covering how to use every part of the app and how to read what it produces - the graph's node/edge legend, a query answer's citations and basis, an API endpoint's params/middleware chain, and a manual annotation's verification status - and toast notifications confirming actions (create/delete/re-index/declare/verify) actually happened.
- **backend/** — Node.js + Express (JavaScript, ESM). Public application API: **real email/password authentication** (registration, login, server-side sessions - see "Authentication and data protection" below), applications (each spanning one or more physical repositories, scoped to the account that created them), GitLab integration (including per-repository access tokens for private repos), indexing jobs (SSE progress), query orchestration + history, source viewer proxy, manual API-annotation CRUD. Never parses code itself - delegates all of that to Python over an internal, shared-secret-protected HTTP API. Users, sessions, applications, and repositories are persisted in Postgres (its own `app_*`-prefixed tables); jobs and query history are still in-memory, a separate and much smaller concern.
- **code-intelligence/** — Python + FastAPI. Internal-only service: repository scanning, real tree-sitter parsing (**Python, JavaScript/TypeScript, and Java**), cross-file graph resolution, **API-endpoint and auth/authz extraction** (Flask/FastAPI decorators, Express route registrations, Spring annotations - see `app/parsing/api_detection/`), **cross-repository frontend→backend API-call linking** (a frontend `fetch()`/`axios` call resolves to the backend route it targets by HTTP method + path shape, even across two different repositories of the same application), **user-declared API annotations** (endpoints the parser can't see, materialized into the graph the same way), embeddings + cosine-similarity vector search, hybrid (graph + vector) retrieval, evidence-grounded answers (OpenAI when `OPENAI_API_KEY` is set, a deterministic evidence-based composer otherwise - never a fabricated answer). Reachable only from the Node backend.
- **Postgres** (`docker-compose.yml`) — one instance, two independent schemas of tables: the code-intelligence tables (below) and the Node backend's own `app_*` platform tables (users, sessions, applications, repositories). **Apache AGE** stores the knowledge graph as one Cypher graph per *application* (which may span several physical repositories, each namespaced by its own `repo_key` within that one shared graph - real graph isolation between applications, not just a filter clause), **pgvector** stores chunk embeddings with cosine-similarity ANN search, and plain tables hold indexing jobs, the incremental-reindex file manifest, the repository registry, and manual API annotations.
- **test-repository/**, **test-repository-2/** — small, real codebases (auth+payment flow; order+notification flow) used as parser/graph test fixture data and, once git-initialized into a temp directory, as real GitLab-flow fixtures for integration/e2e tests.

## Running locally

Start Postgres first (Apache AGE + pgvector, built from `code-intelligence/docker/`):

```bash
docker compose up -d postgres
```

Then each application service, in its own terminal:

```bash
# Backend (http://localhost:4000)
cd backend
cp .env.example .env   # already done if you're continuing this session
npm install
npm run dev

# Python code-intelligence service (http://localhost:8000)
cd code-intelligence
cp .env.example .env
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```

Then open http://localhost:5173, **create an account** (name/email/password -
this is a real account, not a demo login), sign in, and create an
application with a GitLab URL (a public `https://gitlab.com/...` repo
works out of the box, no token needed) or a local
`file:///path/to/a/git/repo`, and watch it index.

An application can span more than one physical repository - e.g. a
React/Next.js frontend and a separate backend service - by adding
additional repository rows on the create form; each is cloned and
indexed under its own namespace into the *same* knowledge graph, so a
frontend `fetch()`/`axios` call resolves to the backend route it targets
even though they live in different repos (see "Cross-repository API-call
linking" below). If a repository is private, check "This repository is
private" and paste a GitLab personal access token for that repository -
tokens are stored only on the server, per repository (a multi-repo
application can use a different token for each one), and are never
returned to the browser once submitted.

To enable real OpenAI-generated answers and embeddings instead of the
local deterministic fallbacks, set `OPENAI_API_KEY` in
`code-intelligence/.env` (`OPENAI_MODEL`/`OPENAI_EMBEDDING_MODEL` default
to `gpt-4o-mini`/`text-embedding-3-small`; override for different models).

## Tests

```bash
docker compose up -d postgres        # code-intelligence tests need a live DB

cd backend && npm test              # 77 tests, includes a real end-to-end
                                     # test that spawns the actual Python
                                     # service and clones a real repo -
                                     # test files run serially (not in
                                     # parallel), since application/user
                                     # data now lives in a real, shared
                                     # Postgres database rather than a
                                     # separate in-memory store per file
cd frontend && npm test             # 53 tests
cd code-intelligence && source .venv/bin/activate && python -m pytest   # 141 tests, against real Postgres/AGE/pgvector
```

## API-endpoint and auth/authz extraction

Ask questions like *"What are the authentication requirements for the payments endpoint?"* and get a real, extracted answer (HTTP method, route, auth mechanism, required roles) - not a generic code summary. This works by recognizing each language's routing convention while parsing:

| Language | Framework | Route detection | Auth detection |
|---|---|---|---|
| Python | Flask / FastAPI | `@app.route(...)`, `@app.get/post/...(...)` | `@login_required`, `@jwt_required`, `@requires_role(...)`, FastAPI `Depends(...)`/`Security(...)` |
| JavaScript/TypeScript | Express | `app.get('/path', ...middleware, handler)` (named-function handlers only - inline handlers are a known gap) | middleware names matching `auth`/`login`/`jwt`/`token`/`guard` |
| Java | Spring | `@GetMapping`/`@PostMapping`/`@RequestMapping` (+ class-level `@RequestMapping` prefix) | `@PreAuthorize`/`@Secured`/`@RolesAllowed` (roles parsed out of `hasRole('X')`-style expressions) |

Detected endpoints become `API`-kind nodes in the graph (see `SymbolKind.API` / `app/domain/api_models.py`) and their metadata rides along on query citations and the graph node detail panel - it's real extracted data, not inferred by the LLM.

### Parameters, middleware chains, and access control, in depth

Beyond method/route/auth-required, every detected endpoint also carries:

- **Request parameters** for every location - path, query, body, header - not just path. Each one is tagged `source: "declared"` (explicit in the route's own signature/annotations - a FastAPI function param, a Spring `@RequestParam`/`@RequestBody`/`@RequestHeader`, an Express `:id` segment) or `source: "observed"` (found by scanning the handler body for real usage - Flask's `request.args`/`request.json`, Express's `req.query`/`req.body` - since those frameworks have no typed signature to declare params in). Query params are the structural answer to "what filtering does this endpoint support."
- **The full middleware/decorator/dependency/annotation chain**, in source declaration order - not just whichever one happens to imply auth. Python's stacked decorators and FastAPI `Depends()`/`Security()` calls, Express's route-registration middleware list, and every Spring method annotation are all recorded, each with a `detail` explaining its effect *only* when that effect is structurally recognizable (a known auth/role pattern) - an unrecognized step is still named, never guessed at.
- **Spring's global `SecurityFilterChain`/`WebSecurityConfigurerAdapter` rules**, merged in as an additional chain step. `app/parsing/api_detection/spring_security_config.py` parses the fluent `.requestMatchers("/admin/**").hasRole("ADMIN")` / `.antMatchers(...).permitAll()` DSL (both the modern `@Bean SecurityFilterChain` and the older `configure(HttpSecurity)` override) into ordered, Ant-pattern rules, and `app/services/spring_security_merger.py` matches each one against every detected route by path (first-match-wins, exactly like real Spring Security evaluates them) - even though the config class and the routes it governs are almost always in different files. A route's own `@PreAuthorize`/`@Secured` is never weakened by a broader global rule; the global rule only *fills in* auth info when the route had none of its own.

At query time, this full structure - not just the summary fields - is handed to the LLM (or, without an `OPENAI_API_KEY`, listed directly by the deterministic template composer). The LLM is also explicitly told it may read the full handler source already included as evidence to describe *behavior* the structural fields alone don't capture - e.g. what a query param actually filters on - while being told to make clear that's a description of what the code appears to do, not a separately-verified fact, and to never describe behavior for code that isn't part of the evidence shown.

## Multi-repository applications

One application (one shared Apache AGE graph, keyed by application id) can span several physical repositories - e.g. a separate frontend and backend, or several microservices. Each repository gets its own `repo_key` (derived from the label you give it, e.g. "frontend"/"backend"); a single-repo application always gets the reserved key `main`, which Python treats as a no-op path prefix, so a plain single-repo application's graph is byte-identical to before multi-repo support existed. Re-indexing one repository never touches another repository's already-resolved symbols or relationships in the shared graph - the resolution pass considers the full cross-repo manifest, not just the repo currently being scanned.

### Cross-repository API-call linking

A frontend `fetch(...)`/`axios.get|post|put|delete|patch(...)`/`axios({method, url})` call is detected (`app/parsing/api_detection/network_calls.py`) and matched to the backend route it targets by normalized HTTP method + path shape (`app/parsing/api_detection/route_matching.py` - `{id}`, `:id`, and `<id>` path-param syntax all normalize to the same placeholder), producing a real `CALLS_API` edge in the graph. This works identically whether the frontend and backend are in the same repository or two different repositories of the same multi-repo application - which is the actual point: it's what makes "how does the frontend talk to the backend" a real, traversable graph relationship instead of two disconnected codebases. Matching is conservative like every other relationship in this project - it only resolves on a unique method+path match, never a guess.

## Manual API annotations

Not every endpoint is visible to the parser - one gated behind an API gateway, exposed by infrastructure config rather than a decorator/route-registration/annotation in code, or simply worth documenting with auth/role details a human knows and the code doesn't state explicitly. The "API Endpoints" tab on any application (reachable regardless of indexing status) lets a user declare one directly: name, method, route, whether it requires auth and how, required roles, and free-form notes. A declared endpoint is stored as real data (`manual_api_annotations` table) and materialized into the graph as an ordinary `API`-kind node - it shows up in the graph view under a synthetic file path that a real repository scan never touches, so re-indexing can never silently delete it.

### Declared-vs-actual verification

A declaration is never taken at face value. Every create/update (and an on-demand "Re-check against code" button) runs it through `app/services/api_annotation_verification.py`, which compares it against the endpoints the parser actually detected in the code graph and records one of: **confirmed** (matches detected code), **conflicting** (a detected endpoint exists at that route, but a declared detail - method, auth requirement, mechanism, or roles - contradicts it), **no_match** (no corresponding endpoint was detected at all), or **unverified** (not yet checked, e.g. no code has been indexed to compare against). Exact route-string matching isn't reliable enough on its own - a user might write `/orders/:id` for what the parser detected as `/orders/{id}` - so when `OPENAI_API_KEY` is set, the comparison uses the LLM's judgment to recognize equivalent routes and reason about the semantic match; without a key (or if the LLM call fails for any reason), it falls back to a conservative structural comparison that only ever confirms an *exact* normalized-route match and never guesses "conflicting" - an indeterminate case is reported "unverified", not fabricated.

This status gates how the declaration is used downstream, not just how it's displayed: a `confirmed` declaration's details are stated as fact in query answers; a `conflicting`/`no_match`/`unverified` one is explicitly flagged as unconfirmed, and the system prefers what it actually sees in the code graph. The deterministic (no-LLM) answer composer enforces this literally - it never states an unconfirmed declaration's own method/auth details as fact, only that it exists and couldn't be confirmed; the OpenAI-backed composer is instructed the same way but can additionally explain *why* (e.g. "the code requires auth, but this declaration claims it doesn't").

### AA-based authorization requirements (stub)

`GET /api/applications/:id/authorizations` (`backend/src/services/authorization.service.js`) looks up which authorizations an application's AA/application number is actually cleared for - fetched whenever a user views an application, the same way its other details are (see the "Authorization requirements" card on the application overview page). The real "AA Authorization Registry" this is meant to call isn't reachable yet, so the endpoint currently returns fixed dummy data (clearly flagged `source: "dummy"`, never presented as fact) in the exact shape the real integration is expected to return. The real fetch, and the comparison against the code's own detected `requiredRoles` that would answer "did the developer actually implement the authorization the AA requires, and correctly" - the same never-fabricate verification approach the manual API annotations use above - are both written out in full at the bottom of `authorization.service.js`, left commented out until that registry's real API contract exists to wire them up against.

## Authentication and data protection

Real email/password accounts, not a demo login - `POST /api/auth/register` and `/login` (`backend/src/services/auth.service.js`), backed by Postgres-persisted users and server-side sessions:

- **Passwords** are hashed with Node's built-in `scrypt` (a fresh random salt per password, OWASP's recommended memory-hard KDF) before they're ever written to a row, compared with a constant-time check on login - the plaintext password is never persisted or logged anywhere (`backend/src/utils/password.js`).
- **Sessions** are opaque random bearer tokens; only their SHA-256 hash is ever stored (`app_sessions.token_hash`) - the same "never store the raw secret" rule applied to the token itself, not just the password (`backend/src/utils/token.js`). The browser's native `EventSource` (used for live indexing-progress streaming) can't set a custom header, so that one endpoint accepts the token as a query param instead - excluded from the access log specifically because of that.
- **GitLab access tokens** (a repository's PAT, entered once and reused on every later re-index) are AES-256-GCM encrypted before being written to `app_repositories.encrypted_access_token`, decrypted only in-process, only when actually needed to clone - never returned to the browser, never logged (`backend/src/utils/crypto.js`).
- **Per-user isolation**: every user is their own tenant (no shared-team model exists yet), and every application/repository read or write is scoped by tenant id all the way down to the SQL `WHERE` clause (`backend/src/repositories/application.repository.js`) - one account can never see, list, or modify another's applications, and a request for someone else's application id 404s rather than 403s, so its existence isn't leaked either.

## What's not built yet (honest gaps)

- **No "forgot password" flow, email verification, or login rate-limiting yet** - registration/login are real, but account recovery and brute-force throttling aren't built. A wrong password is rejected with the same error as an unknown email (no account-enumeration signal), but repeated attempts aren't currently slowed down.
- **No shared team/org model** - each account is its own tenant, so there's no way yet to invite a teammate to see the same applications. The data model (a separate `tenant_id` column, not derived from the user id at query time) is already shaped for that to be a migration later, not an API change.
- **Processing History** (spec §44) - the API/data to support it exists (jobs are never deleted), but there's no dedicated UI page for it yet.
- **Express routes with inline (anonymous) handlers** aren't resolved to an API symbol - only named-function handlers are (see `app/parsing/api_detection/express_api.py`).
- **No TESTS-relationship detection for JS/TS/Java** yet (JUnit `@Test`, `describe`/`it` blocks) - Python's `test_` heuristic doesn't translate directly.
- **Django REST Framework and NestJS** aren't covered by the API detectors yet (Flask/FastAPI, Express, and Spring are).
- **Node's job and query-history state is still in-memory** (users, sessions, applications, and repositories now persist in Postgres - see "Authentication and data protection" above). A job's own progress and a query's history entry don't survive a Node restart, though the application and its indexed data do.
- **Deleting an application removes its own Node-side row and repositories (a real `ON DELETE CASCADE`), but doesn't reach across to the Python service's Postgres/AGE graph data** (symbols, relationships, chunks, manual annotations) for that repository_id. That data is orphaned rather than corrupted (nothing else can reach it without the application record, since the application id no longer exists), but disk/DB space isn't reclaimed automatically.
- **Frontend network-call detection covers `fetch`/`axios` only** - other HTTP clients (e.g. `ky`, framework-specific data-fetching hooks that wrap `fetch` internally, GraphQL clients) aren't recognized, and the path-matching heuristic for string-concatenated URLs (`'/orders/' + id`) treats everything after the literal prefix as a single path parameter, which is usually but not always correct.
- **A manual API annotation only reaches query-answer evidence via an exact name match** (`GraphRetriever.find_named_symbols`, an exact Cypher property match) against a candidate identifier extracted from the question - and that extractor only recognizes CamelCase/`snake_case`-style single tokens. A multi-word declared name like "Refund Payment" won't be found this way even by a question that mentions "refund payment" outright; a single-token name like `RefundPayment` will. It's never reachable by vector similarity search either, since it has no source code to embed. In practice this means a declared endpoint reliably shows up in the graph browser, but only reliably reaches an LLM answer if it's named as one token or the question happens to match verbatim.
- **"observed" params (Flask `request.args`/`request.json`, Express `req.query`/`req.body`) are regex usage-scanning, not real data-flow analysis** - they'll miss a param read through an intermediate variable, a destructured/renamed access, or one only read conditionally deep in a call chain, and can't tell whether a param is actually required (always recorded as `required: false`). "declared" params (a typed FastAPI/Spring signature, an Express `:id` segment) have none of these caveats - the `source` field on every param exists specifically so this distinction is never hidden.
- **Describing *behavior* the structural fields don't capture (e.g. what a filter actually does with a query param) depends on the LLM path.** The deterministic, no-`OPENAI_API_KEY` composer only ever lists the structural params/middleware chain it can state as fact - it doesn't attempt to read and summarize handler logic the way the OpenAI-backed composer is instructed to (see "Parameters, middleware chains, and access control, in depth" above).
- **Spring Security global-rule parsing only recognizes a matcher call's *immediate* next call as its effect** (`.requestMatchers(...).hasRole(...)`) - a rule wrapped in an additional intermediate call (`.requestMatchers(...).access(customAuthorizationManager)`, a `.and()` in the older DSL) isn't detected rather than guessed at.
- **FastAPI's body-vs-query param classification is a naming heuristic** (a capitalized, non-primitive type on a non-path param is assumed to be a Pydantic body model) - without resolving imports to actually confirm a type is a `BaseModel`, an unusually-named primitive-like custom type could be misclassified.
