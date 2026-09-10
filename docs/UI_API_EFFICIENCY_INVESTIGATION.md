# Spark UI/API Efficiency Investigation

Status: living evidence record. Last updated from isolated worktree `ui-api-efficiency/item3-cache` (item 3 complete in PR #92, stacked on PR #91; the CP0–CP2 base remains `c971f1b` from `ci-process/11-deployment-extension`, PR #86).

## Repository reality (CP0)

The original checkout is `/home/marguel/Documents/projects/spark`, on unrelated branch `ci-process/12-failure-annotations` at `f2475f1c5e915b469e5888ea8a5f2be1fe2a2329`, with modified `README.md` and untracked research/e2e files. It was not reset, stashed, cleaned, or edited.

This work is in `/home/marguel/Documents/projects/spark-ui-api-efficiency`, on `ui-api-efficiency/cp1-baseline`, stacked on `test/ui-api-efficiency/cp0-cp2` (PR #89). The original dirty checkout was not reset, stashed, cleaned, or edited. `test/main` resolves to `8c225b9525dd39858c52a23c9ab47b2d4894ec88`; `origin/main` resolves to `159dc3f7b194ad9b2029d6a972d99625dab32313`; neither main is an ancestor of the other (`merge-base=94338de...`). Therefore the test repository's dashboard/UI lineage, not `origin/main`, is the implementation base.

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

The implementation and browser gates are now complete for the bounded local checkpoint. Dependencies were re-provisioned on the rebased tree with `npm exec --yes pnpm@10.15.1 -- install --frozen-lockfile`; typecheck, web tests (65), full tests (431), and web build pass. The current rebased Playwright suite passes 118 tests with 2 opt-in measurement cases skipped.

The opt-in recorder honors `SPARK_PERF_BASE_URL` and `SPARK_PERF_STORAGE_STATE`; with a remote base it does not start local Vite. On 2026-09-10 it ran the full representative matrix against a real local Worker at `http://127.0.0.1:8787`, with a temporary cookie-backed session and synthetic local D1. The seed contained 2 repositories, 100 pull requests, 300 evaluation runs, and 10 lifecycle rows. The run passed 26 scenarios (23 representative cases plus three short dashboard revisits), recorded 0 failed/canceled requests, and recorded 0 requests for the returning-focus probe. Selected samples:

| Scenario | Application requests | Response body bytes | Route-blocking ms |
| --- | ---: | ---: | ---: |
| Dashboard cold | 7 | 258,189 | 120 |
| Activity Show more | 1 | 20,885 | 182 |
| Overview evaluations first page | 10 | 27,805 | 189 |
| Overview merged-unresolved | 6 | 21,941 | 870 |

The full per-scenario JSON is an ignored local artifact under `apps/web/test-results/navigation-performance/`; the temporary storage state and seeded database are not committed. This is real authenticated HTTP/D1 evidence for the local Worker, not fixture evidence. It is not production telemetry: no production deployment lineage, D1 export, or production query-plan access was available.

The committed `pnpm perf:query-plan` probe applies checked-in migrations to an in-memory SQLite database, calls the real Activity/Dashboard/Overview readers, records D1 statement boundaries, and emits `EXPLAIN QUERY PLAN`. The reproducible 2026-09-10 output is:

| Reader boundary | Statements | Result |
| --- | ---: | --- |
| Activity first page | 6 | 100 total, 15 rows, cursor present |
| Dashboard active-changes summary | 1 | 90 total, 15 rows |
| Dashboard first-load composition | 7 | Activity plus active-changes readers |
| Overview evaluations first page | 3 | 300 total, 15 rows, cursor present |
| Merged-unresolved + Outcome | 6 | 10 rows, no cursor, 10 outcome merges |

The Activity and Overview plans materialize history/trend work and use temporary B-trees for ordering/grouping. Direct raw-timestamp and `datetime(...)` comparisons both use a temporary sort B-tree on this schema, so no index rewrite is justified yet. These are reproducible local shape findings, not production latency or rows-read measurements.

## Item 3 cache completion

Item 3 is now implemented on the stackable `ui-api-efficiency/item3-cache` branch. The route boundary uses a typed private in-memory cache with explicit missing/fresh/stale states, per-domain freshness windows, complete query keys, in-flight dedupe, stale-while-revalidate, scoped mutation invalidation, session clearing, and focus/visibility revalidation. See [`UI_API_EFFICIENCY_ITEM3_PLAN.md`](./UI_API_EFFICIENCY_ITEM3_PLAN.md) and [`UI_API_EFFICIENCY_ITEM3_ACCEPTANCE.md`](./UI_API_EFFICIENCY_ITEM3_ACCEPTANCE.md) for the living gates and evidence. CP3/item 4 remains held.

## Correctness and invariants

Authenticated scope remains server-owned and unchanged. No response cache headers were changed (`no-store` remains in Worker JSON responses); the new cache is tab-local only and never persisted or publicly shared. Favorites remain viewer-private, settings concurrency/ETags are untouched, immutable runs and trajectory retention are untouched, and no visualization semantics changed. Existing chart inputs must be audited before any Overview contract split: paginated `items` must never masquerade as full-window distributions.

## Rejected or deferred approaches

- No blanket HTTP/public cache: authenticated private data must not become shared-cacheable.
- No “one giant bootstrap/dashboard endpoint”: independent failure boundaries are intentional until measurements establish a better read model.
- No SQL index or timestamp rewrite: absent query plans and representative data.
- No Activity-sort rewrite: it needs a new bounded, globally ordered server contract and cursor tests rather than a local patch.
- No blanket HTTP/public cache: authenticated data stays out of shared caches; item 3 is intentionally scoped to a private in-memory route cache with explicit invalidation.

## Open questions

- Which `test/main` commit/environment is actually deployed, and how is its Worker deployment tracked?
- What are the real route request/D1 metrics on representative authorized data?
- Do pagination requests recompute Activity/Overview aggregates in the current reader implementations?
- Which charts derive from page samples, and are their labels truthful?
- Can dashboard recent merged state be joined cheaply into its row projection?
