# CI-1001–1005, CI-710 — Bounded CD extension decision

Status: **ACCEPTED** (2026-09-02)

## Question

How may Spark extend its provider-neutral process vocabulary to deployment (CD) observations — including approval states, CI→deployment links, bounded history, and webhook routing — without inventing a parallel CD subsystem, guessing at provider states it cannot see, or moving deployment data onto the live path?

## Decision

G10 extends the **existing** `RepositoryUnderstanding` process model with a `DeploymentObservation` and reuses the CI lifecycle/outcome vocabulary plus one small, separate approval vocabulary. Deployments stay on the bounded shadow/derived path: acquisition is on-demand, webhook handling is log-only, and no D1 write, live ingestion, or attention-policy change is introduced.

### CI-1001/1002 — Deployment observations with a separate approval state

A `DeploymentObservation` carries repository, exact revision, environment, lifecycle, outcome, an independent `approvalState` (`APPROVED | WAITING | NOT_REQUIRED | UNKNOWN`), optional timestamps, and an optional `pipelineRunId`. The semantics are:

- Lifecycle and outcome stay independent, exactly as for CI: `pending`/`queued` → `QUEUED`/`UNKNOWN`, `in_progress` → `RUNNING`/`UNKNOWN`, and a completed deployment is `PASSED` only when the provider state is `success` **and** environment guidance is not an error. An erroring environment downgrades `success` to `FAILED`; an `inactive` environment leaves the outcome `UNKNOWN`.
- `waiting for approval ≠ failure`. A pending/queued deployment in a review environment (pending deployment with at least one reviewer) is `WAITING`; a deployment past a review gate is `APPROVED`; a non-review environment is `NOT_REQUIRED`; an unreadable environment configuration is `UNKNOWN` — never an invented answer.
- Only deployments whose `sha` equals the requested revision are ingested, so deployments of other revisions cannot leak into one revision's understanding.
- Unknown provider states normalize to `UNKNOWN`, not to a nearest guess.

### CI-1003 — CI → deployment relationship from observed links only

`pipelineRunId` is attached **only** when the provider explicitly identifies the originating workflow run via the deployment's `task_id` (mapped to the existing `pipeline-run:github-actions:<runId>` identity). No causality is implied beyond the provider's own link, and no matching is invented from names or timing.

### CI-1004 — Bounded deployment history

Acquisition is bounded and reports why: at most `maxDeploymentPages` pages (default 1 × 100), `maxDeployments` deployments (default 10, retained in ascending provider-deployment-id order after exact-revision filtering), `maxStatusPagesPerDeployment` pages and `maxStatusesPerDeployment` statuses (default 5, ordered by provider creation time with status-id tiebreak) per deployment, plus per-environment pending-deployment lookups cached per environment name. Each source reports `COMPLETE`/`PARTIAL` with observed/expected counts and a reason. Start/completion timestamps derive from the ordered status sequence (first status past `pending` starts; last status updates completion); a deployment with no status is `QUEUED`/`UNKNOWN`, never failed. No raw logs, secrets, artifact contents, or unbounded payloads are retained.

### CI-1005 — Deployment webhook routing on the shadow path

`routeGitHubEvent` routes `deployment` and `deployment_status` (`created`) events to a provider-neutral `deployment` event kind carrying revision, environment, normalized lifecycle/outcome, and optional provider deployment/status/task identifiers. The orchestrator acknowledges these observations with a derived-only structured log entry (`deployment_observed`): no store calls, no provider client, no attention policy. `workflow_run` and `check_suite` are intentionally **not** routed as deployment context: their payloads carry no deployment identifier, so routing them would not be truthful; the deployment→run direction is already covered by `task_id` on the deployment event. Events missing the deployment revision or status state are ignored, not guessed.

### CI-710 — Deployment-state insight, unblocked and implemented

With deployment observations available, `process-insights/v1` derives one `DEPLOYMENT_STATE` insight per observed deployment: deterministic, with supporting observation IDs (deployment plus linked CI run when identified) and the full acquisition completeness set attached. Waiting, queued, running, success, failure, cancelled, and uninterpretable states stay distinct; waiting for approval is explicitly reported as not a failure. Confidence is `SUPPORTED` only while every acquisition dimension is complete, `TENTATIVE` when any dimension is partial, and `UNKNOWN` when the provider state is uninterpretable. In the agent context the insight's formal subject is the deployment observation itself.

## What this does not change

Live ingestion, G6 persistence/replay, G7 insight kinds other than the new `DEPLOYMENT_STATE`, G8 historical analytics, G9 context shapes, evaluation tables, GitHub Checks, attention policy, frontend behavior, and agent behavior remain unchanged. Deployment webhook deliveries are still deduplicated by the existing delivery-claim mechanism, but deployment observations create no new D1 rows and no new attention.

## Retained limitations

- Approval state is only as knowable as the environment's pending-deployment report: an unknown environment yields `UNKNOWN`, and a provider that reports no pending-deployments API exposes `WAITING` only when it reports reviewers.
- Deployment history depth is bounded by the acquisition limits; truncated status or deployment lists make the affected insight `TENTATIVE` rather than silent.
- `completed != successful` unless the provider says success and the environment guidance is not an error; `success` with an `inactive` environment is `UNKNOWN`, not `PASSED`.
- Webhook delivery of `deployment` events gives a timely signal, but authoritative state still comes from the bounded on-demand acquisition; the webhook record carries a snapshot, not the full status sequence.
- No deployment outcome research (rollback analysis, environment health over time) is attempted in G10; the retained history is enough to support it later.

## Verification outcome

Workspace gate: 54 test files / 430 tests, TypeScript (`tsc --noEmit`), and `git diff --check` all pass (2026-09-02). G10-specific evidence: G0 corpus scenarios `deployment-awaiting-approval` and `deployment-failure-after-green-ci` reconstruct to their truth through the bounded acquisition; routing tests prove deployment webhooks are no longer silently ignored; insight tests keep all seven deployment states distinct with provenance, completeness, and bounded detail. No ML, frontend, live-ingestion, D1-write, Check, or attention-policy changes.