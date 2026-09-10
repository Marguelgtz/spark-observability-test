# UI/API Efficiency Handoff

Repository: `/home/marguel/Documents/projects/spark-ui-api-efficiency` (isolated worktree; the original dirty checkout `/home/marguel/Documents/projects/spark` on `ci-process/12-failure-annotations` was left untouched). Branch: `ui-api-efficiency/cp0-cp2`, upstream `test/ui-api-efficiency/cp0-cp2`.

Exact state (verified 2026-09-10; implementation checkpoint before this documentation-only update):

- Initial investigation base: `8c225b9525dd39858c52a23c9ab47b2d4894ec88` (`test/main` at the time).
- Current stacked base: `c971f1b1dd8cfaf6d3c94356be3a6dcb34146df` (`test/ci-process/11-deployment-extension`, PR #86 — the latest compatible open stack; its `apps/web` tree is byte-identical to `8c225b9`, so CP2 behavior is unchanged by the rebase).
- Implementation checkpoint HEAD: `265020d4b3b73c4372b1f4c7b6ef3075dd6b2b52` (`perf(api): capture synthetic dashboard query plans`). Mission commits on the branch continue through `e22ac3d` and this checkpoint; the exact final HEAD after this documentation-only update is always verified with the command below.
- Remotes: `test` → `git@github.com:Marguelgtz/spark-observability-test.git` (where this work lands); `origin` → `https://github.com/spark-opp/spark.git` (older production-Spark lineage, not used for this work).
- Pushed: yes. Remote branch contains implementation checkpoint `265020d` and the preceding measurement/configuration work.
- PR: [#89](https://github.com/Marguelgtz/spark-observability-test/pull/89) `ui-api-efficiency/cp0-cp2` → base `ci-process/11-deployment-extension` (PR #86). OPEN; latest observed checks were all successful and merge state `CLEAN`. Not merged.
- Retarget note: `gh pr edit --base` is broken by the GitHub `projectCards` GraphQL deprecation; the base change was made via REST `gh api -X PATCH repos/Marguelgtz/spark-observability-test/pulls/89 -f base=ci-process/11-deployment-extension`.

What is implemented (committed, on the branch):

- Route `AbortSignal` propagation through the typed API client and the raw Dashboard/Overview/Behavior `fetch` helpers, including Activity paging/history and detail context reads.
- Viewer derived from `/api/account` (`principal.viewer`); redundant `/api/me` bootstrap request removed.
- Favorites bootstrap started only by routes that consume a `FavoriteStore` (Activity, Overview, PR, run, evaluation); no longer eager on Dashboard/Settings/Account/Not Found.
- No backend, D1, response-cache, or chart behavior changed.
- An opt-in navigation measurement recorder plus the `measure:navigation` command. It supports a remote base URL and temporary Playwright storage state without starting local Vite; a shortened local-fixture run passed but does not constitute a production baseline.
- A `perf:query-plan` synthetic D1/SQLite probe that applies checked-in migrations, calls real Dashboard/Overview readers, records statement counts, and emits query plans without private data.

Verification state (layered, exact):

- Committed + pushed: yes (branch above).
- Focused tests: `pnpm web:test` 65/65 pass; the Activity signal assertion reaches the underlying `fetch` init.
- Broader suite: `pnpm typecheck` pass; `pnpm test` 431/431 pass; `pnpm web:build` pass.
- Playwright: current rebased tree passed 118 tests with 2 opt-in measurement cases skipped.
- Synthetic query evidence: `pnpm perf:query-plan` passes on 2 repositories/100 PRs/300 runs; Dashboard reader composition recorded 7 statements, Overview evaluations 3, and merged-unresolved plus Outcome 6. Plans are captured in process output, not committed as data.
- Smoke/real-Worker: NOT performed. No live-browser request counts, D1 statement/row/timing metrics, production query plans, or deployment verification. Do not claim CP1 production performance improvements or live cancellation until authenticated transport evidence exists.

Blockers/limitations:

- CP1 remains bounded-local only: synthetic representative D1/query evidence exists, but no safe authenticated transport fixture or production export is available locally.
- Deployment lineage (which commit/Worker origin is live) is not verifiable from local Git without credentials.

Next exact continuation point:

1. Obtain a temporary authenticated storage state and run the full 17-scenario `pnpm measure:navigation` matrix against a safe Worker; do not commit the state or output.
2. Add a delayed real-network abort test to close E1.
3. If those measurements confirm the local shape, begin CP3: Activity page-only contract, Overview aggregate/page separation, and paginated inline history. Preserve the exact first-page aggregate while appending rows.

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
