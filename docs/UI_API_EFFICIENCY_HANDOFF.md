# UI/API Efficiency Handoff

Repository: `/home/marguel/Documents/projects/spark-ui-api-efficiency` (isolated worktree; the original dirty checkout `/home/marguel/Documents/projects/spark` on `ci-process/12-failure-annotations` was left untouched). Branch: `ui-api-efficiency/item3-cache`, stacked on `test/ui-api-efficiency/e1-real-network` (PR #91).

Exact state (verified 2026-09-10; final commit is recorded after the baseline run):

- Initial investigation base: `8c225b9525dd39858c52a23c9ab47b2d4894ec88` (`test/main` at the time).
- Current stacked base: `c971f1b1dd8cfaf6d3c94356be3a6dcb34146df` (`test/ci-process/11-deployment-extension`, PR #86 — the latest compatible open stack; its `apps/web` tree is byte-identical to `8c225b9`, so CP2 behavior is unchanged by the rebase).
- Parent implementation HEAD: PR #91's `bce548258c9817af1290410be2dbd45a8d3b82d0`; this branch adds item 3 cache/SWR and its acceptance record.
- Final implementation HEAD: `c964bc18dc47fd5aa04b9c2c5f6b791ca0df85d2` (`feat: add private query cache with stale refresh`).
- Remotes: `test` → `git@github.com:Marguelgtz/spark-observability-test.git` (where this work lands); `origin` → `https://github.com/spark-opp/spark.git` (older production-Spark lineage, not used for this work).
- Pushed: yes. The branch is intentionally stackable on PR #91.
- PR: [#92](https://github.com/Marguelgtz/spark-observability-test/pull/92) `ui-api-efficiency/item3-cache` → `ui-api-efficiency/e1-real-network` (PR #91). PRs #92, #91, #90, and #89 are OPEN and not merged.
- Retarget note: `gh pr edit --base` is broken by the GitHub `projectCards` GraphQL deprecation; the base change was made via REST `gh api -X PATCH repos/Marguelgtz/spark-observability-test/pulls/89 -f base=ci-process/11-deployment-extension`.

What is implemented (committed, on the branch):

- Route `AbortSignal` propagation through the typed API client and the raw Dashboard/Overview/Behavior `fetch` helpers, including Activity paging/history and detail context reads.
- Viewer derived from `/api/account` (`principal.viewer`); redundant `/api/me` bootstrap request removed.
- Favorites bootstrap started only by routes that consume a `FavoriteStore` (Activity, Overview, PR, run, evaluation); no longer eager on Dashboard/Settings/Account/Not Found.
- No backend, D1, response-cache, or chart behavior changed.
- An opt-in navigation measurement recorder plus the `measure:navigation` command. It supports a remote base URL and temporary Playwright storage state without starting local Vite; the complete matrix was run against the local Worker and real local D1 with a temporary synthetic session.
- A `perf:query-plan` synthetic D1/SQLite probe that applies checked-in migrations, calls real Activity/Dashboard/Overview readers, records statement boundaries, and emits query plans without private data.
- An opt-in delayed real-network acceptance test plus local proxy. It holds the first `/api/dashboard` response for 1500ms, supersedes the route through SPA navigation, and verifies `net::ERR_ABORTED`, successful Activity render, and no stale Dashboard paint.
- A typed, private query cache with explicit fresh/stale/missing states, domain freshness policy, route-complete keys, in-flight deduplication, stale-while-revalidate, scoped favorites/settings invalidation, session clearing, and focus/visibility revalidation. See [`UI_API_EFFICIENCY_ITEM3_PLAN.md`](./UI_API_EFFICIENCY_ITEM3_PLAN.md) and [`UI_API_EFFICIENCY_ITEM3_ACCEPTANCE.md`](./UI_API_EFFICIENCY_ITEM3_ACCEPTANCE.md).

Verification state (layered, exact):

- Committed + pushed: yes (branch above).
- Focused tests: `pnpm web:test` 70/70 pass; the cache suite covers state transitions, deduplication, SWR, scoped invalidation, and mutation race protection.
- Delayed real-network acceptance: pass; local Worker request failed as `net::ERR_ABORTED`, final route was `/app/activity`, and `staleDashboardPainted` was `false`.
- Broader suite: `pnpm typecheck` pass; `pnpm test` 435/435 pass; `pnpm web:build` pass.
- Playwright: current tree passed 120 tests with 4 opt-in cases skipped, including the desktop/mobile query-cache acceptance; the earlier opt-in authenticated baseline passed all 26 captured scenarios (23 representative cases plus 3 short revisits).
- Authenticated local Worker baseline: `SPARK_PERF_BASE_URL=http://127.0.0.1:8787` with a temporary cookie-backed storage state and synthetic local D1 (2 repositories, 100 PRs, 300 runs, 10 lifecycle rows). The recorder observed 26 scenarios, 0 failed/canceled requests, and 0 requests on the focus-return probe. Dashboard cold was 7 application requests / 258,189 response bytes / 120 ms route-blocking; Activity show-more was 1 / 20,885 / 182 ms; Overview evaluations first page was 10 / 27,805 / 189 ms; merged-unresolved was 6 / 21,941 / 870 ms. Full per-scenario output remains an ignored `test-results/navigation-performance/navigation-*.json` artifact and contains no credential.
- D1/query-plan evidence: the reproducible probe reports Activity first page 6 statements (100 total, 15 rows, cursor); Dashboard active-changes summary 1 statement (90 total, 15 rows); combined Dashboard first-load readers 7; Overview evaluations 3 (300 total, 15 rows, cursor); merged-unresolved plus Outcome 6 (10 rows, no cursor). Both direct raw-timestamp and `datetime(...)` probes still use a temporary sort B-tree on the current schema.
- Scope limitation: this is a real authenticated local Worker/D1 transport baseline, not production telemetry. No production deployment lineage, D1 export, or production query plan was available, so production performance claims remain out of scope.

Blockers/limitations:

- CP1 is complete for the bounded local gate: the safe temporary authenticated transport and query-plan evidence are captured and reproducible. Production telemetry remains a separate follow-up.
- Deployment lineage (which commit/Worker origin is live) is not verifiable from local Git without credentials.

Next exact continuation point:

1. E1 is now closed by the delayed real-network acceptance in [`UI_API_EFFICIENCY_ABORT_ACCEPTANCE_PLAN.md`](./UI_API_EFFICIENCY_ABORT_ACCEPTANCE_PLAN.md): a 1500ms local Worker delay produced `net::ERR_ABORTED`, Activity rendered, and stale Dashboard paint was false.
2. Item 3 is complete: see the living plan and acceptance record for the exact gates and evidence.
3. Do not begin CP3/item 4 until the user explicitly advances the stack. The next branch can implement Activity page-only contracts, Overview aggregate/page separation, and paginated inline history.

Useful commands:

```sh
cd /home/marguel/Documents/projects/spark-ui-api-efficiency
npm exec --yes pnpm@10.15.1 -- install --frozen-lockfile
npm exec --yes pnpm@10.15.1 -- typecheck
npm exec --yes pnpm@10.15.1 -- web:test
npm exec --yes pnpm@10.15.1 -- test
npm exec --yes pnpm@10.15.1 -- web:build
npm exec --yes pnpm@10.15.1 -- web:e2e
npm exec --yes pnpm@10.15.1 -- measure:navigation
npm exec --yes pnpm@10.15.1 -- perf:query-plan
git status --short --branch && git rev-parse HEAD
```
