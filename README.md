# Spark

Spark is an experimental developer tool for **software-change observability**.

**Current V0 Objective**: We are in a strict 72-hour product sprint to launch a functional GitHub App that makes software changes legible enough to automate with confidence.

## The Flow

1. **Install**: Add the Spark GitHub App to your repository.
2. **Open a PR**: Developers open or update a Pull Request.
3. **Spark Check**: Spark evaluates the exact head SHA and provides an Observability Check directly in the PR.

## What V0 Does

V0 is a deterministic, zero-config engine that observes pull requests and reports:
* What changed directly
* What projects or areas may also be affected
* What CI/GitHub Check evidence exists
* What sensitive engineering surfaces are touched
* Whether developer attention should be **LOW**, **MEDIUM**, or **HIGH** (and exactly why)

## What V0 Explicitly Does NOT Do

* Does **not** use an LLM in the runtime evaluation engine.
* Does **not** execute automated code repair or adaptive autonomy.
* Does **not** store customer source code by default.
* Does **not** replace existing CI or observability tools (Sentry, Datadog).
* Does **not** require complex infrastructure (billing, SSO, enterprise RBAC).

## Documentation

Please read the docs in the following order to understand the project philosophy and scope:

1. [GEMINI.md](./GEMINI.md) - The core engineering contract for the V0 sprint.
2. [PRODUCT.md](./docs/PRODUCT.md) - The product thesis and target user jobs.
3. [V0_SCOPE.md](./docs/V0_SCOPE.md) - The strict definition of done for the sprint.
4. [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - The provisional system design.
5. [TEST_SCENARIOS.md](./docs/TEST_SCENARIOS.md) - Deterministic acceptance criteria.
6. [DECISIONS.md](./docs/DECISIONS.md) - The living decision ledger.
7. [ROADMAP.md](./docs/ROADMAP.md) - The directional vision and parking lot.

## Current Status

The deterministic core and the Phase 2 GitHub integration are implemented locally. Automated coverage includes webhook verification and idempotency, GitHub App authentication, paginated PR files, exact-SHA evaluation, generic and JS/TS workspace context, Check Run evidence, neutral Check creation/update, and self-loop prevention.

A deployed GitHub App and a real external pull request still need to be exercised before the Phase 2 milestone is operationally complete.

## Local development

Requirements: Node.js 24+, pnpm 10+, and a GitHub App.

1. Install and verify the workspace:

   ```bash
   pnpm install
   pnpm typecheck
   pnpm test
   pnpm spark:fixture shared-contract
   ```

2. Create a GitHub App with these repository permissions:

   - Metadata: read (GitHub's mandatory baseline)
   - Contents: read
   - Pull requests: read
   - Checks: read and write

   Subscribe only to `installation`, `installation_repositories`, `pull_request`, and `check_run` events. Set the webhook content type to `application/json`, choose a strong webhook secret, and use `/webhooks/github` as the endpoint path.

3. Copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars` and replace every placeholder. Do not commit `.dev.vars`. `GITHUB_APP_SLUG` enables the installation link, and `SPARK_CONTACT_EMAIL` supplies the public contact shown on the legal pages.

4. Create the local D1 schema and start the Worker:

   ```bash
   pnpm db:migrate:local
   pnpm dev
   ```

   The landing page is at `http://127.0.0.1:8787/`, health is at `/health`, legal pages are at `/privacy` and `/terms`, and the webhook is at `/webhooks/github`.

5. Give GitHub a public HTTPS webhook during local testing. One exact Smee path is:

   ```bash
   npx smee-client --url https://smee.io/YOUR_CHANNEL --target http://127.0.0.1:8787/webhooks/github
   ```

   Create the channel at `https://smee.io/new`, configure that channel URL as the GitHub App webhook URL, and use the same webhook secret in GitHub and `.dev.vars`. Smee is only a development proxy.

6. Install the App on a test repository and open a PR. Confirm that `Spark Observability` is attached to the PR's exact head commit. Let another check transition from pending to completed and confirm Spark updates the existing check for that SHA.

## Cloudflare deployment

From `apps/api`, create a D1 database with `pnpm exec wrangler d1 create spark`, replace the placeholder `database_id` in `wrangler.toml`, then run:

```bash
pnpm exec wrangler d1 migrations apply spark --remote
pnpm exec wrangler secret put GITHUB_APP_ID
pnpm exec wrangler secret put GITHUB_PRIVATE_KEY
pnpm exec wrangler secret put GITHUB_WEBHOOK_SECRET
pnpm exec wrangler secret put GITHUB_APP_SLUG
pnpm exec wrangler secret put SPARK_CONTACT_EMAIL
pnpm exec wrangler deploy
```

Configure the deployed `https://<worker>/webhooks/github` URL in the GitHub App. Installation tokens are generated on demand and are never persisted.
