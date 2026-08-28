# Spark

Spark is an experimental GitHub App for **software-change observability**. It turns pull-request activity into a deterministic account of what changed, what may be affected, what evidence exists, and where human attention is warranted.

[Open the live dashboard](https://spark-api.marguel-gtz.workers.dev/app)

> **Project status:** active alpha. Spark is deployed for evaluation and has been exercised against public test pull requests, but it is not yet a generally available or SLA-backed service. The validated dashboard and change-trajectory stack has now been consolidated into `main`.

## Why Spark

A pull request is more than a diff. Reviewers also need to understand repository structure, downstream impact, sensitive surfaces, CI state, and how the change evolved over time. Spark gathers those signals into one explainable observation without replacing GitHub, CI, or human review.

Spark answers:

- What changed directly?
- Which projects or repository areas may also be affected?
- Did the change touch authentication, deployment, migrations, CI, or another sensitive surface?
- Which GitHub Check Runs passed, failed, are pending, or are missing?
- Does the change currently warrant `LOW`, `MEDIUM`, or `HIGH` attention, and why?
- How did those answers change across repeated evaluations of the pull request?

## How it works

1. A GitHub App receives signed installation, pull-request, and Check Run webhooks.
2. Spark evaluates the pull request's exact head SHA.
3. Repository structure, changed paths, sensitive surfaces, and available evidence are normalized.
4. A deterministic rules engine assigns an attention level with explicit reasons.
5. Spark creates or updates a neutral GitHub Check on that SHA.
6. The observation is stored as an immutable run and surfaced in the authenticated dashboard.
7. Later observations build a pull-request trajectory without overwriting earlier history—even when the SHA has not changed.

```text
GitHub webhooks
      │
      ▼
Cloudflare Worker ──► deterministic evaluation ──► Spark GitHub Check
      │
      ▼
Cloudflare D1 ──► authenticated activity, PR history, runs, and favorites
```

## Current capabilities

### Pull-request evaluation

- Generic repository analysis with additional JS/TS workspace context
- Optional repository profile for ownership, criticality, and expected evidence
- Paginated changed-file collection with explicit completeness reporting
- Sensitive-surface detection for areas such as auth, CI, deployment, and migrations
- Deterministic `LOW`, `MEDIUM`, and `HIGH` attention levels
- Exact-SHA Check creation and update, including self-loop prevention

### Change trajectory

- Append-only evaluation runs with durable idempotency
- Atomic persistence of immutable runs and current-state projections
- Separate observations for repeated evaluations of the same SHA
- `LIVE` and `BACKFILL` provenance with truthful partial-history labels
- Run-addressable API and browser routes
- Pull-request insights, evidence transitions, streaks, and previous/next run navigation

### Dashboard

- GitHub OAuth sign-in and repository-scoped access
- Activity filters for time window, attention, repository, text search, and favorites
- Pull-request-first observability pages and expandable run history
- Individually inspectable immutable evaluations
- Database-backed favorites for pull requests and evaluation runs
- Account and GitHub installation management links
- Responsive desktop and mobile layouts

## Deliberate boundaries

Spark is intentionally narrow at this stage:

- The runtime evaluation engine does not use an LLM.
- Spark does not repair code, merge pull requests, or take autonomous repository actions.
- Spark does not replace CI, incident monitoring, or code review.
- Source contents are not stored by default. Persisted observations contain derived evaluation data, repository and PR identity, changed-file paths, evidence metadata, and history.
- GitHub installation tokens are generated on demand and are never persisted.
- Backfilled observations may be incomplete and are labeled accordingly.

## Repository layout

| Path | Purpose |
| --- | --- |
| `packages/core` | Deterministic evaluation, repository graph, attention, and surface rules |
| `packages/github` | GitHub authentication, API access, webhook routing, and Check formatting |
| `packages/dashboard-contracts` | Versioned contracts shared by the API and browser |
| `apps/api` | Cloudflare Worker, D1 persistence, OAuth, webhook, and dashboard APIs |
| `apps/web` | Framework-light TypeScript dashboard built with Vite |
| `apps/cli` | Local fixture runner for deterministic evaluation scenarios |

The workspace uses TypeScript, pnpm, Vitest, Playwright, Cloudflare Workers, and D1.

## Local development

Requirements:

- Node.js 24+
- pnpm 10+
- A GitHub App and OAuth App for end-to-end integration testing

Install dependencies and run the standard verification gates:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm run web:build
pnpm run web:e2e
```

Run a deterministic CLI fixture:

```bash
pnpm spark:fixture shared-contract
```

### GitHub configuration

Create a GitHub App with these repository permissions:

- Metadata: read
- Contents: read
- Pull requests: read
- Checks: read and write

Subscribe to:

- `installation`
- `installation_repositories`
- `pull_request`
- `check_run`

Use `application/json` webhook payloads and point the webhook to `/webhooks/github`.

The dashboard uses a separate GitHub OAuth App for user identity. Its callback URL is `/auth/github/callback` on the Worker origin.

Copy the example environment file and replace every placeholder:

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

The local file contains GitHub credentials and must never be committed. The required configuration is documented in [`apps/api/.dev.vars.example`](./apps/api/.dev.vars.example).

Apply the local database migrations and start the Worker:

```bash
pnpm run db:migrate:local
pnpm dev
```

Useful local routes:

- Dashboard: `http://127.0.0.1:8787/app`
- Health: `http://127.0.0.1:8787/health`
- GitHub webhook: `http://127.0.0.1:8787/webhooks/github`
- Privacy: `http://127.0.0.1:8787/privacy`
- Terms: `http://127.0.0.1:8787/terms`

GitHub requires a public HTTPS webhook. For local integration testing, use a temporary tunnel or webhook relay and forward it to the local webhook route.

## Deployment

Spark deploys the dashboard and API together as a Cloudflare Worker with a D1 binding.

1. Create the D1 database and set its ID in `apps/api/wrangler.toml`.
2. Configure the GitHub App, OAuth, webhook, and public-contact secrets with Wrangler.
3. Apply migrations before deploying code that depends on them.
4. Deploy from the workspace root.

```bash
pnpm run db:migrate:remote
pnpm run deploy
```

Use `pnpm run deploy` explicitly: `pnpm deploy` invokes pnpm's unrelated built-in deployment command.

The permanent dashboard/Worker verification workflow covers workspace typechecking, unit tests, a production dashboard build, local D1 migrations, a Worker/static-assets dry run, and Playwright acceptance on desktop and mobile.

## Project status and development record

The implementation has progressed through several independently reviewed layers:

- Dashboard activity UI and shared contracts
- Versioned evaluation persistence and protected repository reads
- GitHub OAuth and account management
- Pull-request-first observability and history
- Append-only run schema and atomic observation writes
- Historical backfill and immutable history reads
- Run-identity API and browser navigation
- Search and database-backed favorites
- Deterministic Change Trajectory deltas and transition explanations
- Race-safe pull-request lifecycle and pre-merge state reconstruction

The accumulated trajectory stack has passed the permanent dashboard/Worker verification workflow. Earlier experimental PRs remain open as evaluation fixtures and are not part of the product landing sequence.

The append-only Phase 1 foundation and deterministic Phase 2 trajectory engine are on `main`. Phase 3 is split into merge outcome and human feedback: Subphase 3A adds durable lifecycle context and pre-merge state reconstruction; Subphase 3B remains a separate feedback-measurement follow-on.

## Documentation

- [`docs/PRODUCT.md`](./docs/PRODUCT.md) — product thesis and target user jobs
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — evaluation model and system design
- [`docs/V0_SCOPE.md`](./docs/V0_SCOPE.md) — original V0 scope and acceptance threshold
- [`docs/TEST_SCENARIOS.md`](./docs/TEST_SCENARIOS.md) — deterministic scenarios and integration coverage
- [`docs/DECISIONS.md`](./docs/DECISIONS.md) — decision history
- [`docs/ROADMAP.md`](./docs/ROADMAP.md) — directional roadmap and deferred ideas
- [`docs/CHANGE_TRAJECTORY_PHASE1.md`](./docs/CHANGE_TRAJECTORY_PHASE1.md) — append-only run execution record and exit gates
- [`docs/CHANGE_TRAJECTORY_PHASE2.md`](./docs/CHANGE_TRAJECTORY_PHASE2.md) — deterministic trajectory execution record and contracts
- [`docs/CHANGE_TRAJECTORY_PHASE3.md`](./docs/CHANGE_TRAJECTORY_PHASE3.md) — two-subphase merge-outcome and feedback plan

Some planning documents preserve the original V0 framing and should be read as project history where the implementation has moved ahead of them.
