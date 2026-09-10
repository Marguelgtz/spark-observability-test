# Item 3 — typed client query cache and stale-while-revalidate

Status: `[~]` implementation active on `ui-api-efficiency/item3-cache`, stacked on PR #91.

This is the living execution plan for the remaining item 3 work. CP3/item 4 (Activity page-only contracts, Overview aggregate/page separation, and paginated inline history) stays held until every gate below is verified.

## Definition of done

Item 3 is complete only when all of the following are true:

- A typed vanilla-TypeScript in-memory cache has explicit missing, fresh, and stale states, per-query freshness windows, bounded in-flight deduplication, and no persistence to localStorage, a service worker, a CDN, or another user-visible shared cache.
- Dashboard, Activity, Overview, settings, favorites, and route detail reads use deterministic keys containing every changing filter, sort, cursor, metric, route identifier, and preview-size parameter.
- Fresh entries render without a data request. Stale entries render immediately from the retained value and refresh in the background. Missing entries retain the existing loading behavior.
- Concurrent requests for the same key share one in-flight promise. A superseded route cannot paint either stale or late data into the active route.
- Favorite mutations invalidate or patch only the affected favorite/activity entries. Settings mutations update the settings entry coherently and invalidate dependent reads. Account/session boundary changes clear the private cache.
- Focus and visibility return revalidate the active route only when its entries are stale, without a loading skeleton or duplicate requests.
- Tests cover cache state transitions, deduplication, key separation, invalidation, route supersession, focus/visibility gates, fresh revisits, stale background refresh, and authenticated-cache privacy.
- The full repository checks and current Playwright suite pass; the item 3 acceptance evidence is committed with the implementation.

## Execution queue

| ID | Work | Acceptance evidence | Status |
| --- | --- | --- | --- |
| Q1 | Implement typed tab-local cache primitives and policy table. | Unit tests prove missing/fresh/stale transitions, TTLs, bounded retention, and no persistent storage. | `[ ]` |
| Q2 | Key and route all bootstrap, list, aggregate, settings, favorites, and detail reads. | Source review plus tests prove key changes for filters/sort/cursor/metric/route IDs and fresh revisits make zero data requests. | `[ ]` |
| Q3 | Add SWR, promise dedupe, and supersession-safe background refresh. | Unit/browser evidence proves stale data paints immediately, one refresh runs, and late data from an old route is ignored. | `[ ]` |
| Q4 | Add mutation invalidation/patching and session privacy boundaries. | Favorites/settings mutation tests show scoped invalidation/coherent state; logout/session reset clears entries; no public/persistent cache path exists. | `[ ]` |
| Q5 | Add active-route focus/visibility revalidation and finish verification. | Focus/visibility tests show stale-only refresh and no duplicate/skeleton; full typecheck, tests, build, and Playwright are green. | `[ ]` |

## Freshness policy

The policy is intentionally conservative for authenticated data and is kept in code next to the cache. Immutable run/evaluation detail can remain fresh longer; mutable Activity, Dashboard, Overview, settings, and favorites use shorter windows. These are client freshness hints, not authorization or server-cache directives. The cache is private to the current tab and is cleared at session boundaries.

## Change log

- 2026-09-10: plan opened after CP1/CP2/E1 completion. No CP3/item 4 implementation is authorized by this plan until Q1–Q5 are green.
