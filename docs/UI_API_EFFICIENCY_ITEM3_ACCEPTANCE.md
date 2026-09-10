# Item 3 cache acceptance

Status: `[x]` verified 2026-09-10 on `ui-api-efficiency/item3-cache`.

The implementation is a private, typed in-memory cache in `apps/web/src/query-cache.ts`, integrated at the route boundary in `apps/web/src/main.ts`. It has no localStorage, service-worker, CDN, or public HTTP response-cache path, so authenticated values remain scoped to the current browser tab and session.

Acceptance evidence:

- `apps/web/test/query-cache.test.ts`: missing/fresh/stale/expired transitions, concurrent promise deduplication, stale refresh, scoped invalidation, and protection against an invalidated late result overwriting a mutation.
- `apps/web/e2e/query-cache.e2e.ts`: fresh Dashboard → Activity → Dashboard SPA revisit and stale focus/visibility return; retained content stays visible and no route-loading skeleton is painted. The test passes on desktop and mobile in the full suite.
- Full Playwright: 120 passed, 4 opt-in tests skipped. The existing opt-in delayed real-network abort test remains unchanged and still provides the underlying transport-cancellation gate.
- `npm exec --yes pnpm@10.15.1 -- typecheck`: pass.
- `npm exec --yes pnpm@10.15.1 -- web:test`: 70 passed.
- `npm exec --yes pnpm@10.15.1 -- test`: 435 passed.
- `npm exec --yes pnpm@10.15.1 -- web:build`: pass.

Policy is explicit in `main.ts`: mutable Dashboard/Activity/favorites/history reads refresh in seconds; Overview/behavior/trajectory use a longer minute-scale window; immutable run/evaluation details use the longest window. Every route key carries its changing filters, sort/cursor/metric, route IDs, and preview limit. Favorites invalidate only Activity-derived projections; settings replace the settings entry and invalidate dependent projections; logout and unauthorized state clear the complete private cache.

This closes item 3 and CP7. It does not authorize CP3/item 4, which remains a separate backend/API contract stack.
