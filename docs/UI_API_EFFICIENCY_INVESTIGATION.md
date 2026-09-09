# Spark UI/API Efficiency Investigation

Status: living evidence record. Last updated from isolated worktree `ui-api-efficiency/cp0-cp2` at `21bca02e322207556b75ce879a399e417346323b` (stacked on `c971f1b` of `ci-process/11-deployment-extension`, PR #86; PR #89 base retargeted to that branch).

## Repository reality (CP0)

The original checkout is `/home/marguel/Documents/projects/spark`, on unrelated branch `ci-process/12-failure-annotations` at `f2475f1c5e915b469e5888ea8a5f2be1fe2a2329`, with modified `README.md` and untracked research/e2e files. It was not reset, stashed, cleaned, or edited.

This work is in `/home/marguel/Documents/projects/spark-ui-api-efficiency`, created with `git worktree add -b ui-api-efficiency/cp0-cp2 ... test/main`; it is clean before this mission's changes and tracks `test/main`. `test/main` resolves to `8c225b9525dd39858c52a23c9ab47b2d4894ec88`. `origin/main` resolves to `159dc3f7b194ad9b2029d6a972d99625dab32313`; neither main is an ancestor of the other (`merge-base=94338de...`). Therefore `test/main`, not `origin/main`, is the mature dashboard/UI lineage used as the implementation base.

After the initial checkpoint, the implementation branch was rebased onto `test/ci-process/11-deployment-extension` at `c971f1b` and its PR was retargeted to that latest compatible open stack. This excludes the unrelated merged `test/main` documentation commit from the PR diff while retaining the complete dashboard UI ancestry supplied by the CI stack. The rebase was verified patch-identical (`git patch-id` matches for all three mission commits); `git diff 8c225b9 c971f1b -- apps/web` is empty, so the web tree is byte-identical between the old and new bases and CP2 behavior is unchanged. The new base only widens the root test scope (`vitest run packages apps`), which is why the full suite count moved from 236 to 431 on the rebased tree.

Remotes: `origin=https://github.com/spark-opp/spark.git`; `test=git@github.com:Marguelgtz/spark-observability-test.git`. `test/main` is the visible merged dashboard lineage (PR #88 at its tip); `origin/main` is the older production-Spark lineage. `apps/api/wrangler.toml` names the production D1 binding `spark` (`2db2d9a2-41e7-405c-81a5-7912a9c80773`) and deploys web assets with the Worker. `docs/DASHBOARD_AUTH.md` records the production Worker origin. Deployment lineage cannot be proven from local Git alone; no credentialed deployment inspection has been performed.

Relevant historical artifacts were read: `docs/UI_ROUTE_HYGIENE_PLAN.md`, `docs/DASHBOARD_AUTH.md`, `docs/ARCHITECTURE.md`, existing dashboard/activity tests, and the UI stack commits. The route-hygiene plan claims its stack merged on `test/main`; its code and ancestry support that claim, but it is not evidence of production deployment.

Commands used: `git status --short --branch`, `git rev-parse HEAD`, `git remote -v`, `git worktree list`, `git branch -a -vv`, `git log`, `git merge-base`, `git show`, and source/test searches with `rg`.

## Architecture and call matrix

All authenticated browser routes enter `apps/web/src/main.ts#render`, parse `router.ts`, resolve preferences, then call typed helpers. Worker routing in `apps/api/src/index.ts` dispatches Dashboard/Overview/Behavior/alternate-sort handlers before `app.ts`; authorization is performed at each handler boundary using the authenticated repository scope. D1 readers then query `evaluation_runs`, `repositories`, lifecycle/settings/favorite tables and return dashboard-contract payloads.

| Surface | Browser helper(s) | Endpoint/read boundary | Observed concern |
| --- | --- | --- | --- |
| Dashboard | account, dashboard, recent Activity, Overview merged, Overview evaluations, transitions | `/api/account`, `/api/dashboard`, `/api/activity`, `/api/overview/*` | dashboard has independent filler failure boundaries, but recent uses generic Activity and merged labels use a full Overview response |
| Activity/search/favorites/pagination | `DashboardApi.getActivity` | `/api/activity` → `D1DashboardReader.activity` | first page is bounded; inspect page query separately before claiming metadata is repeated |
| alternate Activity sort | same helper | `/api/activity?sort=` → `activity-sorting.ts` → repeated `handleRequest` | verified exhaustive all-pages Worker read + in-memory sort + offset cursor |
| inline PR history | `getPullRequestHistory` | `/api/repositories/:id/pulls/:pr/evaluations` | contract currently loads full returned history; pagination is not implemented |
| Overview / Show more / merged unresolved | `getOverviewDrilldown` | `/api/overview/:metric` → `overview-handler.ts` | inspect handler/query before separating summary/page contract |
| Settings / Account | account, settings, Activity(limit=1) | `/api/account`, `/api/settings`, `/api/activity` | verified settings obtains repository choices through Activity; account contains viewer |
| PR trajectory / behavior | trajectory + behavior helpers | trajectory and behavior endpoints | two independent route requests; backend duplication still needs reader evidence |
| run/evaluation detail | run/evaluation, then PR context | scoped run/evaluation then PR endpoint | route cancellation now applies to both calls |
| behavior patterns | `getBehaviorPatterns` | `/api/behavior/patterns` | boundedness and query shape remain unmeasured |

## Confirmed findings and changes

1. `main.ts` started both `cachedViewer()` (`/api/me`) and `cachedAccount()` (`/api/account`) on every route. `/api/account` returns `principal.viewer` in `app.ts`. The implementation now derives the viewer promise from account, removing the redundant `/api/me` bootstrap request.
2. `AbortController` previously only wrapped promises in `abortable`; none of the underlying dashboard, overview, behavior, or typed API `fetch` calls received the route signal. The implementation now threads the signal to those requests, including Activity paging/history and detail context reads.
3. Favorites were eagerly requested even on Dashboard, Settings, Account, and Not Found. They are now started only by Activity, Overview, PR, run, or evaluation routes, which consume a `FavoriteStore`.
4. Alternate sort is pathological as described: `activity-sorting.ts#readAllActivity` repeatedly invokes generic Activity until exhaustion, sorts in memory, and returns offset pagination. It is not changed in this boundary.
5. `activity-home.ts` has several full-history CTEs and `datetime(column)` ordering/filtering. Schema/index changes are deferred until representative D1 data and `EXPLAIN QUERY PLAN` evidence exist.

## Baseline and measurement status (CP1)

Static source evidence establishes the request shapes above but is **not a network/D1 baseline**. No authenticated fixture or production D1 export was supplied. Dependencies were re-provisioned on the rebased tree with `npm exec --yes pnpm@10.15.1 -- install --frozen-lockfile`; on HEAD `21bca02` (base `c971f1b`): typecheck passed, `pnpm web:test` passed (65 tests), `pnpm test` passed (431 tests — the new base scopes vitest to `packages apps`), and `pnpm web:build` passed. The fixture-backed Playwright suite passed on the pre-rebase tree (118 desktop/mobile tests); it was not re-run after the rebase (web tree is byte-identical, so this is a gap to close at the next checkpoint, not a regression). Consequently request counts, response bytes, D1 statement counts, rows read, timings, cancellation network events, and query plans are still unresolved—not inferred from the external audit.

The next measurement must use a safe authenticated/local fixture and Playwright request recorder for: cold Dashboard; Dashboard→PR→Dashboard; Activity initial/Show more/search/favorites/sorts; inline history; all Overview metrics/Show more; settings/account/detail; rapid navigation; and stale-tab focus. Capture endpoint count/bytes plus Worker/D1 query evidence. Do not commit private data.

Focused certification for this boundary: `pnpm typecheck` passed; `pnpm web:test` passed (65 tests, including the new Activity signal assertion); `pnpm test` passed (236 tests); `pnpm web:build` passed; and the fixture-backed Playwright suite passed (118 desktop/mobile tests). These certify compilation and helper-level signal forwarding, not live-Worker cancellation or request-count improvements.

## Correctness and invariants

Authenticated scope remains server-owned and unchanged. No response cache headers were changed (`no-store` remains in Worker JSON responses); the new cache work is explicitly unstarted. Favorites remain viewer-private, settings concurrency/ETags are untouched, immutable runs and trajectory retention are untouched, and no visualization semantics changed. Existing chart inputs must be audited before any Overview contract split: paginated `items` must never masquerade as full-window distributions.

## Rejected or deferred approaches

- No blanket HTTP/public cache: authenticated private data must not become shared-cacheable.
- No “one giant bootstrap/dashboard endpoint”: independent failure boundaries are intentional until measurements establish a better read model.
- No SQL index or timestamp rewrite: absent query plans and representative data.
- No Activity-sort rewrite: it needs a new bounded, globally ordered server contract and cursor tests rather than a local patch.
- No route query cache yet: cache key/invalidation/freshness must follow measured payload and mutation behavior.

## Open questions

- Which `test/main` commit/environment is actually deployed, and how is its Worker deployment tracked?
- What are the real route request/D1 metrics on representative authorized data?
- Do pagination requests recompute Activity/Overview aggregates in the current reader implementations?
- Which charts derive from page samples, and are their labels truthful?
- Can dashboard recent merged state be joined cheaply into its row projection?
