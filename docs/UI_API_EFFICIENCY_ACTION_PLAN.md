# UI/API Efficiency Action Plan

Status legend: `[ ]` planned, `[~]` in progress, `[x]` verified, `[!]` blocked, `[-]` deliberately deferred. “Verified” requires the stated gate, not merely an implementation diff.

## Checkpoints

- [~] CP0 — repository recovery: isolated dashboard worktree created from verified `test/main` `8c225b9`; after CP2 checkpoint the branch was rebased onto the latest compatible open stack `ci-process/11-deployment-extension` (`c971f1b`, PR #86) and PR #89 retargeted to it. Deployment lineage remains unverified externally.
- [x] CP1 — bounded authenticated local baseline: real HTTP navigation against the local Worker with a temporary cookie session and synthetic local D1 is complete; production D1 telemetry remains a separate limitation.
- [x] CP2 — cancellation/bootstrap: signal propagation and removal of duplicated viewer/favorites bootstrap are implemented; typecheck/web-test/full-unit/build, current Playwright, and the delayed real-network abort acceptance are verified.
- [ ] CP3 — page-only Activity/Overview contracts and paginated inline history, after CP1 contract/query evidence.
- [ ] CP4 — native bounded Activity sorting; remove exhaustive adapter only with global keyset-order tests.
- [ ] CP5 — query/index/projection work only after `EXPLAIN QUERY PLAN` on representative data.
- [ ] CP6 — chart input audit and aggregate-vs-sample correction.
- [x] CP7 — focus/visibility stale-while-revalidate is verified as part of item 3; the cache remains private and stale-only on focus/visibility return.

## Active tasks

- [x] E1: certify CP2 signal propagation. Acceptance passed: every route-owned GET receives the current route signal; a delayed real Worker HTTP request failed as `net::ERR_ABORTED` after SPA navigation; Activity rendered and stale Dashboard paint was false. Evidence: `docs/UI_API_EFFICIENCY_ABORT_ACCEPTANCE_PLAN.md`.
- [x] E2: certify bootstrap reduction by source review, typecheck, and current fixture browser gate. Viewer derives from `/api/account`; favorites are lazy on non-consuming routes.
- [x] M1: opt-in Playwright recorder is implemented and the complete 26-sample authenticated local matrix passed (23 representative scenarios plus 3 short revisit delays). It used a temporary cookie-backed storage state against the local Worker and never committed the state or JSON artifact.
- [x] M2: synthetic D1 probe exercises the real Activity/Dashboard/Overview readers and emits query plans: Activity 6 statements, Dashboard summary 1 (7 combined first-load), Overview evaluations 3, and merged-unresolved plus Outcome 6. Production telemetry remains a separate limitation.
- [ ] P1: determine whether Activity cursor pages recompute static metadata; design V2/page-only response if confirmed.
- [ ] P2: determine whether Overview cursor pages recompute trends/outcome intelligence; split summary/page response only if confirmed.
- [ ] P3: design inline-history cursor contract retaining exact count and immutable run identity.
- [ ] B1: replace `activity-sorting.ts` read-all adapter with SQL-backed deterministic keyset cursors.
- [ ] B2: profile dashboard reader duplication and PR trajectory/behavior double reconstruction.
- [ ] C1: audit each Dashboard/Overview visualization input and correct sampled-distribution labels/data.
- [x] Item 3 cache/focus revalidation: typed cache, SWR/dedupe, scoped invalidation, session privacy, and focus/visibility acceptance are verified on `ui-api-efficiency/item3-cache`; the living execution record is `UI_API_EFFICIENCY_ITEM3_PLAN.md`.

### Item 3 execution queue

- [x] Q1: add a typed, tab-local in-memory query cache with explicit fresh/stale/missing states and per-domain freshness windows.
- [x] Q2: route Dashboard, Activity, Overview, settings, favorites, and detail reads through keyed cache entries; keys include changing filters, sort, cursor, metric, and route parameters.
- [x] Q3: deduplicate concurrent reads and implement stale-while-revalidate without stale data painting after route supersession.
- [x] Q4: invalidate or patch affected entries on favorites/settings mutations; clear the cache on account/session boundary changes; keep authenticated responses out of persistent/public caches.
- [x] Q5: revalidate the active route on focus/visibility return, add unit and browser acceptance coverage, and re-run the full verification stack.

## Change/evidence log

| Date | Evidence | Plan change |
| --- | --- | --- |
| 2026-09-09 | `test/main` is `8c225b9`; `origin/main` is divergent `159dc3f`; source proves account includes viewer | Chose isolated `test/main` worktree and CP2 bootstrap de-duplication. |
| 2026-09-09 | `abortable` guarded rendering only; raw `fetch` helpers did not accept a signal | Added E1 implementation before cache/projection work. |
| 2026-09-09 | `activity-sorting.ts#readAllActivity` loops all generic Activity pages | Retained as B1; no superficial page-local sorting. |
| 2026-09-09 | Locked dependencies installed; typecheck, web tests (65), full tests (236), and web build pass | Reclassified CP2 as focused-test/build verified; CP1 remains blocked only on safe runtime/query evidence. |
| 2026-09-10 | Reviewed later-agent recorder: documented script/config did not exist or honor remote base/storage state | Added the command and corrected configuration; fixture recorder validation passed, while CP1 remains unmeasured. |
| 2026-09-10 | Current rebased Playwright: 118 passed, 2 opt-in measurement cases skipped | Closed the post-rebase browser-suite gap; retained E1/M1 as open for real authenticated transport evidence. |
| 2026-09-10 | Synthetic SQLite/D1 probe: Dashboard reader boundary 7 statements; Overview evaluations 3; merged-unresolved + Outcome 6; 100 PRs/300 runs; timestamp probes use temp B-tree ordering | Closed M2 for bounded local evidence; opened CP3 inputs P1/P2 with explicit production-validation caveat. |
| 2026-09-10 | Authenticated local Worker baseline: 26 scenarios passed against real HTTP + local D1 with temporary cookie session; 0 failed/canceled requests; cold Dashboard 7 application requests/258,189 response bytes/120 ms; Activity show-more 1/20,885/182 ms; Overview evaluations 10/27,805/189 ms; merged-unresolved 6/21,941/870 ms | Closed CP1/M1 for the bounded local gate; retained E1 because rapid switching did not produce a canceled request and retained the production telemetry caveat. |
| 2026-09-10 | Delayed real-network acceptance: local Worker `/api/dashboard` held 1500 ms, SPA navigation produced `net::ERR_ABORTED`, Activity rendered, and stale Dashboard paint was false | Closed E1. Item 3 cache/SWR remains the next gate; CP3/item 4 stays held. |
| 2026-09-10 | Item 3 implementation requested after CP1/CP2/E1 closure | Opened Q1–Q5 execution queue; CP3/item 4 remains held until every item 3 gate is green. |
| 2026-09-10 | Item 3 acceptance: cache unit suite 70 web tests, browser suite 120 passed/4 skipped, typecheck, full 435-test suite, and web build all pass | Closed Q1–Q5 and CP7; CP3/item 4 remains held. |

## Next checkpoint (item 3 completion; CP3 remains held)

1. Finish Q1–Q5 in order, keeping this queue and the handoff synchronized after each verified gate.
2. Prove fresh revisits, stale immediate paint plus background refresh, concurrent-request deduplication, mutation invalidation, focus/visibility revalidation, route supersession safety, and private-cache boundaries.
3. Commit and push the item 3 stack as a new PR on PR #91. Do not begin CP3/item 4 in this branch.
| 2026-09-09 | `test/main` is behind the open CI stack; PR #89 originally based on `8c225b9`. Rebased `ui-api-efficiency/cp0-cp2` onto `c971f1b` (PR #86 head): all three mission commits patch-identical (`git patch-id`), `git diff 8c225b9 c971f1b -- apps/web` empty. PR #89 base changed to `ci-process/11-deployment-extension` via REST (`gh pr edit` broken by projectCards deprecation). | Kept CP2 state as-is (web tree byte-identical); re-verified on rebased tree: typecheck pass, web:test 65 pass, test 431 pass (new base widens vitest scope to `packages apps`), web:build pass. Playwright re-run deferred to next checkpoint. |
