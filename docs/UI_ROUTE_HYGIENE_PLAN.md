# UI Route Hygiene Action Plan

Status: active living plan. **PR 1 (this document) is the base of the stack and is `IN PROGRESS`; PRs 2-8 are `BACKLOG`.** All work is delivered as small, independently-mergeable, stackable PRs.

Source: the web-UI route/href map and the route-specific hole & pain-point audit captured on `ui/12-dashboard-signal-placement` (HEAD `8ab7a9a`).

## Outcome

This stack removes the route-specific holes and architectural pain points in the web UI without changing any route's URL contract or any backend/contract behavior. The work is successful when:

- A detail page's back-link has one explicit, correct target and label (no text-matched override), and "back" behaves consistently across `pull-request`, `run`, `evaluation`, and `account`.
- The `dashboard` and `activity` routes apply the same filter state, and list-state serialization (including the `cursor`/`limit` policy) is deliberate and tested.
- Repository selection has a single canonical representation in `ActivityUrlState`.
- The `/runs/` and `/evaluations/` href builders and the router share one id grammar, so a valid detail link can never silently 404.
- The dashboard's async section fillers are driven by a small scoped-effect primitive (generation-guarded), never by implicit testid coupling, and skip work in empty states.
- No dead renderers (`home-ui.ts`) remain; signed-out and low-traffic routes present a consistent, non-dead nav.

## Scope guardrails

- Preserve every existing route pattern (`router.ts#parseRoute`) and `data-router-link` SPA navigation.
- Keep the URL the single source of truth for route + list state.
- No API / dashboard-contract / attention-scoring changes in this stack - UI, state, and router only.
- Each PR must pass `pnpm typecheck`, `pnpm test`, `pnpm web:build`, and `pnpm --filter @spark/web e2e` on its own.
- Do not reorder the stack in a way that breaks a PR's base; if you do, record it in the change log.

## How this plan stays dynamic

### Task statuses

- `BACKLOG`: accepted, not yet eligible. `READY`: deps + acceptance defined. `IN PROGRESS`: the single current task. `BLOCKED`: blocker + alternatives recorded. `DONE`: acceptance evidence passes and is linked. `DROPPED`: removed with reason.

### Update rules

1. Keep finding/task IDs stable; never reuse an ID.
2. Keep at most one task `IN PROGRESS`.
3. As a PR lands, mark its tasks `DONE`, set the PR row `DONE`, and note the PR/commit in the Evidence column.
4. Correct wording via a note, not by rewriting accepted work.
5. At the end of the stack, reconcile this file and fold landed rows into a `docs/mark-stack-landed`-style sweep.

### The stack (base chain)

The base for the whole stack is the tip of the dashboard signal-placement stack, `ui/12-dashboard-signal-placement`, so every file these PRs touch already exists. Each PR bases on the previous PR. When the signal-placement stack lands on `main`, rebase the stack onto `main` and retarget the open PRs.

## Findings to PR map

| ID | Sev | Route(s) | Finding | PR |
| --- | --- | --- | --- | --- |
| A1 | high | pull-request, run, evaluation, account | Back-link target set in 3 places; `pointBackToActivity` rewrites by `textContent.includes('Activity')`; "back" means `/app/activity` on detail routes but `/app` on account | PR 2 |
| A2 | high | dashboard vs activity | Same controls, different state behavior: dashboard window/repo reset `attention`/`query`/`favorites`; activity preserves them | PR 4 |
| A3 | med | activity, dashboard | `cursor`/`limit` parsed from URL but never serialized; pagination is not URL-owned (breaks source-of-truth) | PR 4 |
| A4 | med | all list routes | `repositoryId` + `repositorySelection` dual representation with hand-rolled (de)serialization | PR 5 |
| A5 | low | signed-out | Signed-out state keeps a live-but-doomed nav bar | PR 8 |
| B1 | med | dashboard (home) | `home-ui.ts` is fully dead (zero references); live home is `dashboard-ui.ts` | PR 3 |
| B2 | high | run, evaluation | `/runs/` (opaque) vs `/evaluations/` (hex-only `[a-f0-9]{7,64}`) builder/parser grammar mismatch can yield a silent `not-found` | PR 6 |
| B3 | high | dashboard | Async section fillers couple to testids across files; a rename silently no-ops (stuck skeleton); wasted requests in empty states | PR 7 |
| B4 | med | all async routes | `generation !== routeGeneration` guard is copy-pasted into every callback; a footgun for new async work | PR 7 |
| C1 | low | dashboard (legacy) | `legacyActivityRedirect` only fires for `/app` + activity-shaped params; window/repo-only legacy bookmarks stay on the dashboard | PR 8 |
| C2 | low | settings, account, not-found | settings has no back link; account back is mislabeled; no nav item is active on account/not-found | PR 8 |
| C3 | low | run, evaluation | Back-link flickers "back" then "back PR #n" once the async PR-context resolves | PR 7 |

## Stack overview

| PR | Branch | Base | Title | Status |
| --- | --- | --- | --- | --- |
| 1 | `docs/ui-route-hygiene-plan` | `ui/12-dashboard-signal-placement` | docs: add UI route-hygiene action plan & stack tracker | IN PROGRESS |
| 2 | `ui/13-back-link-unification` | PR 1 | fix(web): unify detail back-link target & label | BACKLOG |
| 3 | `ui/14-drop-dead-home-ui` | PR 2 | refactor(web): remove dead home-ui renderer | BACKLOG |
| 4 | `ui/15-list-state-consistency` | PR 3 | fix(web): align dashboard/activity filter state | BACKLOG |
| 5 | `ui/16-repository-selection-canonical` | PR 4 | refactor(web): canonicalize repository selection state | BACKLOG |
| 6 | `ui/17-runs-evaluations-grammar` | PR 5 | fix(web): align runs/evaluations id grammar | BACKLOG |
| 7 | `ui/18-scoped-route-effects` | PR 6 | refactor(web): scoped, generation-guarded route effects | BACKLOG |
| 8 | `ui/19-route-hygiene-sweep` | PR 7 | fix(web): route hygiene sweep (nav, back-links, legacy) | BACKLOG |

## Decisions needed (product/eng calls)

| ID | Decision | Recommendation | Owner |
| --- | --- | --- | --- |
| D1 | Where should the `account` back-link go, and what label | Target `/app`, relabel to "Dashboard" (it is a top-level page, not a queue item) | product |
| D2 | `cursor`/`limit` URL policy | (a) serialize `cursor` so result pages are shareable/bookmarkable, or (b) stop reading them and document pagination as intentionally non-persistent | product + eng |
| D3 | Signed-out nav | Hide or disable the Dashboard/Activity/Settings links when signed out | product |
| D4 | Detail back-link referer-awareness | PR 2 makes the back-link correct + consistent; defer true referer-awareness (return to the exact list you came from) to PR 7 | eng |

## PR 2 - `ui/13-back-link-unification`

Goal: one explicit back-link model with the correct target and label on every route.

| Status | ID | Task | Evidence |
| --- | --- | --- | --- |
| TODO | R2.1 | Introduce an explicit back-link contract (renderers take `back: { label, href }`, or emit a `data-back-to` the router honors); remove `pointBackToActivity` (`main.ts:165-169`) and the per-renderer `/app` defaults (`pr-ui.ts:440`, `ui.ts:515`, `ui.ts:594`) | typecheck + e2e |
| TODO | R2.2 | Detail routes (pull-request/run/evaluation) back to `/app/activity?<state>` with label "Activity"; preserve the state query | e2e back-link href assertions |
| TODO | R2.3 | Fix the `account` back-link per D1 (`account-ui.ts:39-41`) | e2e |
| TODO | R2.4 | Keep the overview back "Change overview" to `/app` (`overview-ui.ts:153-154`); assert it, do not change | test |
| TODO | R2.5 | Update e2e that assert back-link hrefs (`dashboard.e2e.ts`, `pull-request.e2e.ts`, `evaluation.e2e.ts`) | e2e green |

Acceptance: no `.back-link` target is derived from `textContent`; every route's back-link target + label is set in exactly one place; all e2e back-link assertions pass.

## PR 3 - `ui/14-drop-dead-home-ui`

| Status | ID | Task | Evidence |
| --- | --- | --- | --- |
| TODO | R3.1 | Delete `apps/web/src/home-ui.ts` (re-verify zero importers with a grep immediately before deleting) | `grep -r home-ui` returns nothing |
| TODO | R3.2 | Confirm the live home is `dashboard-ui.ts#renderOperationalDashboard`; remove stale references/comments to the old home renderer | typecheck + build |

## PR 4 - `ui/15-list-state-consistency`

| Status | ID | Task | Evidence |
| --- | --- | --- | --- |
| TODO | R4.1 | Extract a shared `applyListFilter(state, patch)` so `dashboard` and `activity` mutate list state identically; wire both (`main.ts:272-279` vs `main.ts:180-200`) to it | unit test: same patch produces the same next state on both routes |
| TODO | R4.2 | Implement the `cursor`/`limit` URL policy per D2 in `serializeActivityState` / `parseActivityState` (`state.ts:47`, `state.ts:54`, `state.ts:62-73`) | round-trip test |
| TODO | R4.3 | Add state round-trip + dashboard/activity parity tests | `pnpm test` |

Acceptance: changing window/repo on the dashboard no longer silently wipes `attention`/`query`/`favorites` (or the difference is documented and asserted); the cursor policy is intentional and tested.

## PR 5 - `ui/16-repository-selection-canonical`

| Status | ID | Task | Evidence |
| --- | --- | --- | --- |
| TODO | R5.1 | Make `repositorySelection` canonical and derive a read-only `repositoryId` where needed; drop the dual write path in `withActivityState` (`state.ts:81-85`) and the legacy serialize fallback (`state.ts:68`) | unit tests |
| TODO | R5.2 | Update all consumers (dashboard/activity handlers, api calls) to the canonical field | typecheck |
| TODO | R5.3 | Add serialization tests for absent / all / repository | `pnpm test` |

## PR 6 - `ui/17-runs-evaluations-grammar`

| Status | ID | Task | Evidence |
| --- | --- | --- | --- |
| TODO | R6.1 | Define one id grammar for detail routes; make the `/evaluations/` parser and the href builders agree (validate or broaden `router.ts:39`) so every produced href re-parses to the same route | router unit test |
| TODO | R6.2 | Add a regression test: a non-hex `headSha` (or otherwise invalid id) must not silently 404 - it must parse or fail loudly | router test |
| TODO | R6.3 | Document the `/runs/` (new) vs `/evaluations/` (legacy) end-state and the plan to retire the legacy route | doc note |

## PR 7 - `ui/18-scoped-route-effects`

| Status | ID | Task | Evidence |
| --- | --- | --- | --- |
| TODO | R7.1 | Add a small scoped-effect helper (bundles the `generation !== routeGeneration \|\| signal.aborted` guard, e.g. via an AbortController-scoped callback) and use it for the dashboard fillers (`main.ts:283-316`) and the detail enhancers (`pr-ui.ts` run/evaluation PR-context) | review + e2e |
| TODO | R7.2 | Replace the cross-file testid coupling in the dashboard fillers with an explicit handle/registry (the shell hands each filler its target node) so a rename cannot silently no-op | dashboard e2e: recent/insights/merged sections fill |
| TODO | R7.3 | Skip the recent/insights/merged requests in the `no-repositories` / `no-history` dashboard states (`dashboard-ui.ts:320-327`) | e2e: no wasted filler calls in empty states |
| TODO | R7.4 | Fix the back-link flicker (C3) by reserving the back-link slot and setting label + href once the PR-context resolves (builds on PR 2; covers D4) | e2e |

Acceptance: no filler relies on a raw `querySelector('[data-testid=...]')` across files; fast navigation never paints a stale route; empty dashboard states make no filler requests.

## PR 8 - `ui/19-route-hygiene-sweep`

| Status | ID | Task | Evidence |
| --- | --- | --- | --- |
| TODO | R8.1 | Signed-out nav per D3: hide/disable Dashboard/Activity/Settings when signed out (`main.ts:218-224`) | dashboard.e2e signed-out test |
| TODO | R8.2 | Give `settings` a back link; ensure a nav item is active on `account` / `not-found` (`app-shell.ts:65-70` `primaryRoute`); align the `account` back-label if D1 changes it | e2e |
| TODO | R8.3 | Decide + document the `legacyActivityRedirect` asymmetry (window/repo-only legacy bookmarks) - either extend it or leave it with a comment (`router.ts:44-51`, `main.ts:239-240`) | router test |

## Verification & workflow

Every PR: `pnpm typecheck` -> `pnpm test` -> `pnpm web:build` -> `pnpm --filter @spark/web e2e`. Use conventional commits scoped `web` / `settings` / `docs` (matching history). Push to the `test` remote; open each PR against the previous PR's branch. When the signal-placement stack lands on `main`, rebase this stack onto `main` and retarget the open PRs.
