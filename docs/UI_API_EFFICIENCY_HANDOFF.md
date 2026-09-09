# UI/API Efficiency Handoff

Repository: `/home/marguel/Documents/projects/spark-ui-api-efficiency` (isolated worktree; the original dirty checkout `/home/marguel/Documents/projects/spark` on `ci-process/12-failure-annotations` was left untouched). Branch: `ui-api-efficiency/cp0-cp2`, upstream `test/ui-api-efficiency/cp0-cp2`.

Exact state (verified 2026-09-09):

- Initial investigation base: `8c225b9525dd39858c52a23c9ab47b2d4894ec88` (`test/main` at the time).
- Current stacked base: `c971f1b1dd8cfaf6d3c94356be3a6dcb34146df` (`test/ci-process/11-deployment-extension`, PR #86 — the latest compatible open stack; its `apps/web` tree is byte-identical to `8c225b9`, so CP2 behavior is unchanged by the rebase).
- HEAD: `21bca02e322207556b75ce879a399e417346323b` (clean tree after the final doc commit).
- Mission commits on the branch: `08118b8` fix(web): cancel route data requests and dedupe bootstrap → `0dde528` docs: record UI API efficiency checkpoint → `21bca02` docs: record UI API efficiency pull request. All three are patch-identical to their pre-rebase counterparts (`git patch-id` verified).
- Remotes: `test` → `git@github.com:Marguelgtz/spark-observability-test.git` (where this work lands); `origin` → `https://github.com/spark-opp/spark.git` (older production-Spark lineage, not used for this work).
- Pushed: yes. Remote branch head = local HEAD `21bca02` (force-pushed after rebase).
- PR: [#89](https://github.com/Marguelgtz/spark-observability-test/pull/89) `ui-api-efficiency/cp0-cp2` → base `ci-process/11-deployment-extension` (PR #86). OPEN, mergeable (`mergeable_state` was `unstable` = CI running on head `21bca02`; 6/7 checks green at last check, `verify` in progress). Not merged.
- Retarget note: `gh pr edit --base` is broken by the GitHub `projectCards` GraphQL deprecation; the base change was made via REST `gh api -X PATCH repos/Marguelgtz/spark-observability-test/pulls/89 -f base=ci-process/11-deployment-extension`.

What is implemented (committed, on the branch):

- Route `AbortSignal` propagation through the typed API client and the raw Dashboard/Overview/Behavior `fetch` helpers, including Activity paging/history and detail context reads.
- Viewer derived from `/api/account` (`principal.viewer`); redundant `/api/me` bootstrap request removed.
- Favorites bootstrap started only by routes that consume a `FavoriteStore` (Activity, Overview, PR, run, evaluation); no longer eager on Dashboard/Settings/Account/Not Found.
- No backend, D1, response-cache, or chart behavior changed.

Verification state (layered, exact):

- Committed + pushed: yes (branch above).
- Focused tests: `pnpm web:test` 65/65 pass on rebased HEAD `21bca02`, including the new assertion that the Activity route signal reaches the underlying `fetch` init.
- Broader suite (rebased tree, base `c971f1b`): `pnpm typecheck` pass; `pnpm test` 431/431 pass (the new base scopes vitest to `packages apps`, hence 431 vs the pre-rebase 236); `pnpm web:build` pass.
- Playwright: the fixture-backed suite (118 desktop/mobile tests) passed on the pre-rebase tree; it was NOT re-run after the rebase. The `apps/web` tree is byte-identical between bases, so this is a known gap, not a regression — re-run it at the next checkpoint.
- Smoke/real-Worker: NOT performed. No live-browser cancellation evidence, no network request counts, no D1 statement/row/timing metrics, no query plans, no deployment verification. Do not claim CP1 performance improvements or live cancellation until a delayed-navigation network test and a safe authenticated fixture exist.

Blockers/limitations:

- CP1 blocked: no safe authenticated/representative D1 fixture or production export is available locally.
- Deployment lineage (which commit/Worker origin is live) is not verifiable from local Git without credentials.

Next exact continuation point:

1. Re-run the Playwright suite on the rebased tree to close the post-rebase gap: `npm exec --yes pnpm@10.15.1 -- web:e2e` (or the script the repo defines for the fixture-backed suite).
2. CP1: provision a safe local authenticated fixture (Worker + D1 or SQLite mirror of the schema with synthetic data only), then add a Playwright request-recorder matrix for the 17 mission scenarios; record endpoint counts/bytes; capture Worker D1 statement counts and `EXPLAIN QUERY PLAN` for hot Activity/Dashboard/Overview paths. No private data in Git.
3. Then proceed to the next living-plan checkpoint (CP3 page-only contracts) only after P1/P2 reader evidence is recorded.

Useful commands:

```sh
cd /home/marguel/Documents/projects/spark-ui-api-efficiency
npm exec --yes pnpm@10.15.1 -- install --frozen-lockfile
npm exec --yes pnpm@10.15.1 -- typecheck
npm exec --yes pnpm@10.15.1 -- web:test
npm exec --yes pnpm@10.15.1 -- test
npm exec --yes pnpm@10.15.1 -- web:build
git status --short --branch && git rev-parse HEAD
```