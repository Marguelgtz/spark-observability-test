# UI/API Efficiency Action Plan

Status legend: `[ ]` planned, `[~]` in progress, `[x]` verified, `[!]` blocked, `[-]` deliberately deferred. “Verified” requires the stated gate, not merely an implementation diff.

## Checkpoints

- [~] CP0 — repository recovery: isolated dashboard worktree created from verified `test/main` `8c225b9`; after CP2 checkpoint the branch was rebased onto the latest compatible open stack `ci-process/11-deployment-extension` (`c971f1b`, PR #86) and PR #89 retargeted to it. Deployment lineage remains unverified externally.
- [!] CP1 — measurable baseline: a safe authenticated/representative D1 fixture is unavailable; record browser and query-plan evidence before performance claims.
- [~] CP2 — cancellation/bootstrap: signal propagation and removal of duplicated viewer/favorites bootstrap are implemented; typecheck/web-test/full-unit/build verified on the rebased tree (21bca02); browser-level delayed-navigation certification and post-rebase Playwright re-run remain open.
- [ ] CP3 — page-only Activity/Overview contracts and paginated inline history, after CP1 contract/query evidence.
- [ ] CP4 — native bounded Activity sorting; remove exhaustive adapter only with global keyset-order tests.
- [ ] CP5 — query/index/projection work only after `EXPLAIN QUERY PLAN` on representative data.
- [ ] CP6 — chart input audit and aggregate-vs-sample correction.
- [ ] CP7 — focus/visibility stale-while-revalidate after cache/read costs are established.

## Active tasks

- [~] E1: certify CP2 signal propagation. Acceptance: every route-owned GET receives the current route signal; a delayed fetch aborted by navigation rejects at the fetch layer; no stale paint. Files: web API helpers and route test harness.
- [~] E2: certify bootstrap reduction. Acceptance: cold route uses `/api/account` as viewer source and does not call `/api/me`; favorites fetch only on consuming routes.
- [~] M1: opt-in Playwright recorder is implemented and fixture-validated; acquire a temporary authenticated storage state and measure the full 17-scenario matrix against a safe Worker environment.
- [ ] M2: instrument/read Worker query evidence without permanent noisy production logging; run `EXPLAIN QUERY PLAN` for hot Activity/Dashboard/Overview paths.
- [ ] P1: determine whether Activity cursor pages recompute static metadata; design V2/page-only response if confirmed.
- [ ] P2: determine whether Overview cursor pages recompute trends/outcome intelligence; split summary/page response only if confirmed.
- [ ] P3: design inline-history cursor contract retaining exact count and immutable run identity.
- [ ] B1: replace `activity-sorting.ts` read-all adapter with SQL-backed deterministic keyset cursors.
- [ ] B2: profile dashboard reader duplication and PR trajectory/behavior double reconstruction.
- [ ] C1: audit each Dashboard/Overview visualization input and correct sampled-distribution labels/data.
- [-] Cache/focus revalidation: deferred until M1/M2 bound freshness cost and mutation invalidation requirements.

## Change/evidence log

| Date | Evidence | Plan change |
| --- | --- | --- |
| 2026-09-09 | `test/main` is `8c225b9`; `origin/main` is divergent `159dc3f`; source proves account includes viewer | Chose isolated `test/main` worktree and CP2 bootstrap de-duplication. |
| 2026-09-09 | `abortable` guarded rendering only; raw `fetch` helpers did not accept a signal | Added E1 implementation before cache/projection work. |
| 2026-09-09 | `activity-sorting.ts#readAllActivity` loops all generic Activity pages | Retained as B1; no superficial page-local sorting. |
| 2026-09-09 | Locked dependencies installed; typecheck, web tests (65), full tests (236), and web build pass | Reclassified CP2 as focused-test/build verified; CP1 remains blocked only on safe runtime/query evidence. |
| 2026-09-10 | Reviewed later-agent recorder: documented script/config did not exist or honor remote base/storage state | Added the command and corrected configuration; fixture recorder validation passed, while CP1 remains unmeasured. |
| 2026-09-09 | `test/main` is behind the open CI stack; PR #89 originally based on `8c225b9`. Rebased `ui-api-efficiency/cp0-cp2` onto `c971f1b` (PR #86 head): all three mission commits patch-identical (`git patch-id`), `git diff 8c225b9 c971f1b -- apps/web` empty. PR #89 base changed to `ci-process/11-deployment-extension` via REST (`gh pr edit` broken by projectCards deprecation). | Kept CP2 state as-is (web tree byte-identical); re-verified on rebased tree: typecheck pass, web:test 65 pass, test 431 pass (new base widens vitest scope to `packages apps`), web:build pass. Playwright re-run deferred to next checkpoint. |
