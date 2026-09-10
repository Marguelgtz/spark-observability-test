# UI/API Efficiency Action Plan

Status legend: `[ ]` planned, `[~]` in progress, `[x]` verified, `[!]` blocked, `[-]` deliberately deferred. “Verified” requires the stated gate, not merely an implementation diff.

## Checkpoints

- [~] CP0 — repository recovery: isolated dashboard worktree created from verified `test/main` `8c225b9`; after CP2 checkpoint the branch was rebased onto the latest compatible open stack `ci-process/11-deployment-extension` (`c971f1b`, PR #86) and PR #89 retargeted to it. Deployment lineage remains unverified externally.
- [x] CP1 — bounded authenticated local baseline: real HTTP navigation against the local Worker with a temporary cookie session and synthetic local D1 is complete; production D1 telemetry remains a separate limitation.
- [~] CP2 — cancellation/bootstrap: signal propagation and removal of duplicated viewer/favorites bootstrap are implemented; typecheck/web-test/full-unit/build and current Playwright are verified. A deliberately delayed real-network abort test remains open.
- [ ] CP3 — page-only Activity/Overview contracts and paginated inline history, after CP1 contract/query evidence.
- [ ] CP4 — native bounded Activity sorting; remove exhaustive adapter only with global keyset-order tests.
- [ ] CP5 — query/index/projection work only after `EXPLAIN QUERY PLAN` on representative data.
- [ ] CP6 — chart input audit and aggregate-vs-sample correction.
- [ ] CP7 — focus/visibility stale-while-revalidate after cache/read costs are established.

## Active tasks

- [~] E1: certify CP2 signal propagation. Acceptance: every route-owned GET receives the current route signal; a delayed fetch aborted by navigation rejects at the fetch layer; no stale paint. Unit forwarding is verified; the completed local rapid-switch sample had no canceled request, so the delayed real-network proof remains.
- [x] E2: certify bootstrap reduction by source review, typecheck, and current fixture browser gate. Viewer derives from `/api/account`; favorites are lazy on non-consuming routes.
- [x] M1: opt-in Playwright recorder is implemented and the complete 26-sample authenticated local matrix passed (23 representative scenarios plus 3 short revisit delays). It used a temporary cookie-backed storage state against the local Worker and never committed the state or JSON artifact.
- [x] M2: synthetic D1 probe exercises the real Activity/Dashboard/Overview readers and emits query plans: Activity 6 statements, Dashboard summary 1 (7 combined first-load), Overview evaluations 3, and merged-unresolved plus Outcome 6. Production telemetry remains a separate limitation.
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
| 2026-09-10 | Current rebased Playwright: 118 passed, 2 opt-in measurement cases skipped | Closed the post-rebase browser-suite gap; retained E1/M1 as open for real authenticated transport evidence. |
| 2026-09-10 | Synthetic SQLite/D1 probe: Dashboard reader boundary 7 statements; Overview evaluations 3; merged-unresolved + Outcome 6; 100 PRs/300 runs; timestamp probes use temp B-tree ordering | Closed M2 for bounded local evidence; opened CP3 inputs P1/P2 with explicit production-validation caveat. |
| 2026-09-10 | Authenticated local Worker baseline: 26 scenarios passed against real HTTP + local D1 with temporary cookie session; 0 failed/canceled requests; cold Dashboard 7 application requests/258,189 response bytes/120 ms; Activity show-more 1/20,885/182 ms; Overview evaluations 10/27,805/189 ms; merged-unresolved 6/21,941/870 ms | Closed CP1/M1 for the bounded local gate; retained E1 because rapid switching did not produce a canceled request and retained the production telemetry caveat. |

## Next checkpoint (CP3 proposal; do not start until the user approves continuation)

1. Split Activity page retrieval from first-page metadata/home summaries. Acceptance: page 2 performs one bounded page query, preserves first-page metadata, and tests cursor/filter reset semantics.
2. Split Overview drilldown pages from trend/Outcome aggregates. Acceptance: page 2 does not rerun trend or Outcome work; first-page charts retain exact aggregates and contracts remain backward compatible.
3. Add paginated inline history. Acceptance: first expansion fetches preview only, Show more uses a cursor, run IDs remain stable, and exact retained total remains visible.
| 2026-09-09 | `test/main` is behind the open CI stack; PR #89 originally based on `8c225b9`. Rebased `ui-api-efficiency/cp0-cp2` onto `c971f1b` (PR #86 head): all three mission commits patch-identical (`git patch-id`), `git diff 8c225b9 c971f1b -- apps/web` empty. PR #89 base changed to `ci-process/11-deployment-extension` via REST (`gh pr edit` broken by projectCards deprecation). | Kept CP2 state as-is (web tree byte-identical); re-verified on rebased tree: typecheck pass, web:test 65 pass, test 431 pass (new base widens vitest scope to `packages apps`), web:build pass. Playwright re-run deferred to next checkpoint. |
