# UI/API Efficiency Action Plan

Status legend: `[ ]` planned, `[~]` in progress, `[x]` verified, `[!]` blocked, `[-]` deliberately deferred. “Verified” requires the stated gate, not merely an implementation diff.

## Checkpoints

- [~] CP0 — repository recovery: isolated dashboard worktree created from verified `test/main` `8c225b9`; deployment lineage remains unverified externally.
- [!] CP1 — measurable baseline: a safe authenticated/representative D1 fixture is unavailable; record browser and query-plan evidence before performance claims.
- [~] CP2 — cancellation/bootstrap: signal propagation and removal of duplicated viewer/favorites bootstrap are implemented and unit/build verified; browser-level delayed-navigation certification remains open.
- [ ] CP3 — page-only Activity/Overview contracts and paginated inline history, after CP1 contract/query evidence.
- [ ] CP4 — native bounded Activity sorting; remove exhaustive adapter only with global keyset-order tests.
- [ ] CP5 — query/index/projection work only after `EXPLAIN QUERY PLAN` on representative data.
- [ ] CP6 — chart input audit and aggregate-vs-sample correction.
- [ ] CP7 — focus/visibility stale-while-revalidate after cache/read costs are established.

## Active tasks

- [~] E1: certify CP2 signal propagation. Acceptance: every route-owned GET receives the current route signal; a delayed fetch aborted by navigation rejects at the fetch layer; no stale paint. Files: web API helpers and route test harness.
- [~] E2: certify bootstrap reduction. Acceptance: cold route uses `/api/account` as viewer source and does not call `/api/me`; favorites fetch only on consuming routes.
- [ ] M1: create a Playwright network matrix plus a safe data fixture identity; measure the 17 mission scenarios and record counts/bytes/latency.
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
