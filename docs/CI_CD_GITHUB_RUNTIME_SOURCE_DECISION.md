# CI-207 — GitHub Actions runtime source and identity decision

Status: **ACCEPTED** (2026-09-01)

## Decision

GitHub Actions REST data is the canonical source for workflow execution hierarchy. Check Runs remain a supplemental compatibility/evidence source; they are not used to reconstruct attempts, jobs, or steps.

For one exact revision, acquisition is:

1. `GET /repos/{owner}/{repo}/actions/runs?head_sha={sha}` — discover logical workflow runs and the latest `run_attempt` for each run.
2. `GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt}` — recover exact historical-attempt state for retained prior attempts. The list response itself describes the latest attempt.
3. `GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt}/jobs` — acquire jobs for that exact attempt. Steps are embedded in each returned job.
4. Existing `commits/{sha}/check-runs` data may supplement the identity crosswalk and legacy `Evidence`; it is not canonical process state.

The decision follows GitHub's current REST contracts: workflow runs expose `workflow_id`, stable `id`, `check_suite_id`, `head_sha`, and `run_attempt`; the attempt-specific jobs endpoint exposes job IDs, results, timestamps, steps, and `check_run_url`. The check-runs-by-ref endpoint defaults to `filter=latest`, so it cannot reconstruct prior attempts by itself.

Authoritative contracts:

- [Workflow runs REST API](https://docs.github.com/en/rest/actions/workflow-runs)
- [Workflow jobs REST API](https://docs.github.com/en/rest/actions/workflow-jobs)
- [Check runs REST API](https://docs.github.com/en/rest/checks/runs)

## Identity crosswalk

| Canonical concept | GitHub identity | Rule |
| --- | --- | --- |
| Pipeline definition identity | normalized workflow path at the repository/revision | Joins runtime to exact-revision declaration content. `workflow_id` remains the provider crosswalk and fallback when the run exposes no usable path. |
| Logical pipeline run | workflow run `id` | Reruns retain this ID. |
| Attempt | `(run.id, run_attempt)` | Attempt number is never promoted to a new logical run. |
| Workflow/check-suite bridge | `run.check_suite_id` ↔ `check_run.check_suite.id` | Supplemental bridge for matching supplied Checks data to an Actions run. |
| Job execution | attempt + job `id` | Job IDs are distinct across rerun attempts. |
| Job/check-run bridge | `job.check_run_url` terminal ID | Direct bridge; no name matching. |
| Step execution | `(job.id, step.number)` | Step sequence is scoped to the job execution. |

Human-readable workflow, job, and step names are labels, not identities.

## Bounded acquisition

Default bounds are exported as `DEFAULT_GITHUB_ACTIONS_LIMITS`:

| Dimension | Default | Completeness behavior |
| --- | ---: | --- |
| Workflow-run result pages | 1 × 100 | More provider results make `github-actions-runs` PARTIAL. |
| Retained logical runs | 10 | Only the first ten exact-revision runs returned by GitHub are expanded; additional runs make acquisition PARTIAL. |
| Attempts per run | 3 | Retain the newest attempt window; older attempts make `github-actions-attempts` PARTIAL. |
| Job pages per attempt | 1 × 100 | Additional jobs make jobs and embedded-step acquisition PARTIAL. |

The default worst-case Actions request count is 51: one run-list request plus ten runs × (two prior-attempt detail requests + three attempt-specific job requests). All truncation is explicit through `SourceCompleteness`; no bounded result is described as complete when GitHub reports a larger total.

The adapter stores structured metadata only. It does not fetch logs, artifacts, runner machine names/IDs, secrets, environment values, or action inputs.

Private-repository acquisition requires the GitHub App installation token to have repository **Actions: read** permission. The shadow adapter is not wired into production until that permission is confirmed; permission failure must surface as unavailable acquisition rather than falling back to inferred process data.

## Normalization decisions

- Lifecycle and outcome remain independent. Unknown provider statuses map to `UNKNOWN/UNKNOWN`, never to queued, failed, or not-observed.
- `completed/cancelled` maps to `CANCELLED/UNKNOWN`.
- `completed/skipped` maps to `COMPLETED/SKIPPED`, not pass or failure.
- `failure`, `timed_out`, and `startup_failure` map to failed outcomes. Unrecognized conclusions remain unknown.
- Self-hosted runner classification is retained only when the returned labels explicitly contain `self-hosted`; runner identity is discarded.
- Runtime step names are observations. Commands/actions are not inferred from names; declaration correlation supplies them later.
- Workflow-run `updated_at` is not treated as a completion timestamp. Attempts retain `run_started_at`; an exact completion timestamp remains absent unless a source exposes it without inference.

## Provider limitations discovered by CI-207

The job response does not provide trustworthy declared `needs` edges or structured matrix coordinates. Therefore:

- CI-205 cannot infer “blocked by upstream” from a skipped runtime job alone. It now depends on CI-302 declaration parsing/correlation; until then the adapter records `COMPLETED/SKIPPED` only.
- CI-206 preserves every matrix execution through unique job identity and display name without parsing that name. Structured matrix coordinates require a later declaration-correlation task (CI-306).
- Workflow `path` in a run response is not treated as checked-in definition content. G3 still reads workflow bytes at the evaluated SHA.

## Scope and cutover

This adapter is a shadow acquisition path. It does not change `buildSparkInputFromPullRequest`, legacy Check Run ingestion, attention policy, persistence, or the neutral Spark Check. Live cutover remains a later Repository Understanding gate.
