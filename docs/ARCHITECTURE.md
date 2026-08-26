# Provisional Architecture

This is the provisional system design for Spark V0. It is intentionally simple to meet the 72-hour sprint constraint. Do not over-design.

## Pipeline Flow

```text
GitHub
→ webhook
→ verification
→ GitHub adapter
→ normalized change input
→ repository/project analysis
→ evidence normalization
→ attention evaluation
→ SparkEvaluation
→ persistence
→ GitHub Check
```

## Conceptual Core Entities

* **Repository**: The VCS project context (e.g., `owner/repo`).
* **Change**: The specific pull request or commit under review.
* **ChangedFile**: A single file modification (added, modified, deleted).
* **Project**: A logical module or workspace within the repository.
* **Area**: A semantic zone (e.g., `frontend`, `database`, `ci-cd`).
* **Relationship**: Links between projects or areas (e.g., `depends-on`).
* **Evidence**: External verification signals (e.g., CI check runs).
* **AttentionSignal**: An individual flag raised during evaluation (e.g., "Touches DB migrations").
* **SparkEvaluation**: The final synthesized output containing the attention level and context.

## System Components

### GitHub Adapter Boundary
Isolates GitHub-specific API logic (fetching PR diffs, reading check runs, writing check results) from the core domain. This ensures the evaluation engine remains unaware of the transport layer.

### Generic Repo Analysis
Fallback analysis for any repository type. Analyzes file extensions, directory structures, and known sensitive paths to determine touched areas.

### JS/TS Workspace Analysis
Enhanced analysis for JavaScript/TypeScript monorepos (specifically npm/yarn/pnpm workspaces). Parses `package.json` to build an internal dependency graph and accurately map affected downstream projects.

### Future Nx/Turbo Adapters
(Deferred to P1/V0.1) Deep integration for complex monorepo build tools to extract precise affected project lists.

### Sensitive Surfaces
A deterministic matching engine that flags files matching known critical patterns:
* CI/CD configurations (`.github/workflows/`)
* Deployments/Infrastructure (Helm, Terraform, Docker)
* Database migrations (`migrations/`, `prisma/`)
* Auth/Security (`auth`, `permissions`)

### Evidence Normalization
Translates GitHub Check Runs (and eventually other sources) into a standard `Evidence` model: `PENDING`, `PASSED`, `FAILED`, `MISSING`.

### Attention Engine
A deterministic rule engine that takes the analyzed projects, sensitive surfaces, and normalized evidence to output a final `LOW`, `MEDIUM`, or `HIGH` attention score with explicit reasons.

## Infrastructure & Constraints

* **Persistence Principles**: Store only what is necessary to operate (installations, repo metadata). No source-code storage by default. Simple relational persistence.
* **Preferred Simple Deployment**: A Cloudflare Workers-compatible backend utilizing Cloudflare D1 for SQLite relational persistence.
* **Minimum GitHub Permissions**:
  * Read access to code/metadata (for diffs and file structures)
  * Read access to commit statuses/checks (for evidence)
  * Write access to checks (to post Spark Check)
* **Relevant Webhook Events**:
  * `installation` (created/deleted)
  * `pull_request` (opened, synchronize, reopened)
  * `check_run` (completed - to trigger reevaluation)
* **Spark's Own Logging**: Minimal operational observability (request IDs, latency, errors) without logging user code secrets.
* **Evaluator Versioning**: Capability to tag the output check with the version of the engine that ran it, aiding debugging.

## Implemented Phase 2 boundary

```text
apps/api (signature verification, routing, orchestration, D1)
  → packages/github (GitHub auth/API/normalization/check formatting)
  → packages/core (provider-neutral deterministic evaluation)
```

`packages/github` resolves the immutable tuple of installation, repository, PR number, and head SHA. It paginates changed files, compares the fetched count with GitHub's PR metadata, reads Check Runs for that SHA, and attempts a bounded JS/TS workspace resolution. Unsupported or truncated repository structures remain `unknown`; they do not produce a fabricated graph.

Every GitHub Check Run is observed evidence. Its name, source App, lifecycle status/conclusion, and URL are preserved. Coverage is always `UNKNOWN` because GitHub does not explicitly assert a project relationship. Spark's own check is removed before evaluation.

The Worker verifies `X-Hub-Signature-256` against the unmodified request bytes before parsing or persistence. It authenticates with a short-lived GitHub App JWT, exchanges that for an installation token on demand, and never stores the token. Check Runs are keyed operationally by repository ID plus exact head SHA; reevaluation updates the persisted Check Run ID.

After verification and an atomic delivery-ID claim, the Worker schedules routing and orchestration with `ExecutionContext.waitUntil()` and immediately acknowledges GitHub with HTTP 202. Background failures are logged without payloads or credentials and release the delivery claim so a manual GitHub redelivery can retry the same delivery ID. V0 intentionally does not add a queue before real latency demonstrates that one is necessary.

## Persistence actually required

Four D1 tables support the V0 loop:

* `installations`: installation and owning GitHub account identifiers.
* `repositories`: installed repository identity and its installation.
* `evaluations`: repository, exact head SHA, PR number, attention, and Spark Check Run ID.
* `webhook_deliveries`: delivery ID and event name, retained for seven days for idempotency.

No access tokens, source, diffs, or raw webhook bodies are persisted.

## Runtime limits

GitHub exposes at most 3,000 files from the PR-files endpoint. Spark marks the analysis incomplete when the PR metadata count is larger. A truncated Git tree or a JS/TS workspace with more than 100 package manifests falls back to truthful generic analysis to avoid manufacturing partial dependency relationships or exhausting installation rate limits.
