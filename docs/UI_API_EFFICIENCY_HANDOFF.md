# UI/API Efficiency Handoff

Repository: `/home/marguel/Documents/projects/spark-ui-api-efficiency` (isolated worktree; the original dirty checkout `/home/marguel/Documents/projects/spark` on `ci-process/12-failure-annotations` was left untouched). Branch: `ui-api-efficiency/cp1-baseline`, stacked on `test/ui-api-efficiency/cp0-cp2`.

Exact state (verified 2026-09-10; final commit is recorded after the baseline run):

- Initial investigation base: `8c225b9525dd39858c52a23c9ab47b2d4894ec88` (`test/main` at the time).
- Current stacked base: `c971f1b1dd8cfaf6d3c94356be3a6dcb34146df` (`test/ci-process/11-deployment-extension`, PR #86 — the latest compatible open stack; its `apps/web` tree is byte-identical to `8c225b9`, so CP2 behavior is unchanged by the rebase).
- Parent implementation HEAD: `6598905` (`docs: close local efficiency evidence checkpoint`); this branch adds the complete authenticated local baseline, query-plan boundary split, and living-document updates.
- Final baseline HEAD: `430d81bd28dbef3534d46b11781024955bfbcf3d` (`perf: close authenticated local efficiency baseline`).
- Remotes: `test` → `git@github.com:Marguelgtz/spark-observability-test.git` (where this work lands); `origin` → `https://github.com/spark-opp/spark.git` (older production-Spark lineage, not used for this work).
- Pushed: yes. The branch is intentionally stackable on PR #89.
- PR: [#90](https://github.com/Marguelgtz/spark-observability-test/pull/90) `ui-api-efficiency/cp1-baseline` → `ui-api-efficiency/cp0-cp2` (PR #89), which itself targets `ci-process/11-deployment-extension` (PR #86). PR #90 and PR #89 are OPEN and not merged.
- Retarget note: `gh pr edit --base` is broken by the GitHub `projectCards` GraphQL deprecation; the base change was made via REST `gh api -X PATCH repos/Marguelgtz/spark-observability-test/pulls/89 -f base=ci-process/11-deployment-extension`.

What is implemented (committed, on the branch):

- Route `AbortSignal` propagation through the typed API client and the raw Dashboard/Overview/Behavior `fetch` helpers, including Activity paging/history and detail context reads.
- Viewer derived from `/api/account` (`principal.viewer`); redundant `/api/me` bootstrap request removed.
- Favorites bootstrap started only by routes that consume a `FavoriteStore` (Activity, Overview, PR, run, evaluation); no longer eager on Dashboard/Settings/Account/Not Found.
- No backend, D1, response-cache, or chart behavior changed.
- An opt-in navigation measurement recorder plus the `measure:navigation` command. It supports a remote base URL and temporary Playwright storage state without starting local Vite; the complete matrix was run against the local Worker and real local D1 with a temporary synthetic session.
- A `perf:query-plan` synthetic D1/SQLite probe that applies checked-in migrations, calls real Activity/Dashboard/Overview readers, records statement boundaries, and emits query plans without private data.

Verification state (layered, exact):

- Committed + pushed: yes (branch above).
- Focused tests: `pnpm web:test` 65/65 pass; the Activity signal assertion reaches the underlying `fetch` init.
- Broader suite: `pnpm typecheck` pass; `pnpm test` 431/431 pass; `pnpm web:build` pass.
- Playwright: current rebased tree passed 118 tests with 2 opt-in measurement cases skipped; the opt-in authenticated baseline passed all 26 captured scenarios (23 representative cases plus 3 short revisits).
- Authenticated local Worker baseline: `SPARK_PERF_BASE_URL=http://127.0.0.1:8787` with a temporary cookie-backed storage state and synthetic local D1 (2 repositories, 100 PRs, 300 runs, 10 lifecycle rows). The recorder observed 26 scenarios, 0 failed/canceled requests, and 0 requests on the focus-return probe. Dashboard cold was 7 application requests / 258,189 response bytes / 120 ms route-blocking; Activity show-more was 1 / 20,885 / 182 ms; Overview evaluations first page was 10 / 27,805 / 189 ms; merged-unresolved was 6 / 21,941 / 870 ms. Full per-scenario output remains an ignored `test-results/navigation-performance/navigation-*.json` artifact and contains no credential.
- D1/query-plan evidence: the reproducible probe reports Activity first page 6 statements (100 total, 15 rows, cursor); Dashboard active-changes summary 1 statement (90 total, 15 rows); combined Dashboard first-load readers 7; Overview evaluations 3 (300 total, 15 rows, cursor); merged-unresolved plus Outcome 6 (10 rows, no cursor). Both direct raw-timestamp and `datetime(...)` probes still use a temporary sort B-tree on the current schema.
- Scope limitation: this is a real authenticated local Worker/D1 transport baseline, not production telemetry. No production deployment lineage, D1 export, or production query plan was available, so production performance claims remain out of scope.

Blockers/limitations:

- CP1 is complete for the bounded local gate: the safe temporary authenticated transport and query-plan evidence are captured and reproducible. Production telemetry remains a separate follow-up.
- Deployment lineage (which commit/Worker origin is live) is not verifiable from local Git without credentials.

Next exact continuation point:

1. Add a delayed real-network abort test to close E1; the authenticated local baseline did not produce a canceled request in its rapid-switch sample.
2. If approved, begin CP3: Activity page-only contract, Overview aggregate/page separation, and paginated inline history. Preserve the exact first-page aggregate while appending rows.

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
