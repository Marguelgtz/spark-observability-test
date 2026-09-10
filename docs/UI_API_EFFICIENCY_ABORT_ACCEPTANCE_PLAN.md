# Delayed Real-Network Abort Acceptance Plan

Status: `[x]` verified 2026-09-10. This is the E1 acceptance gate for the UI/API efficiency work; item 4 / CP3 remains held until item 3 caching is complete.

## Objective

Prove that superseding a route aborts the underlying browser HTTP request, not only the promise wrapper that prevents stale rendering.

## Test boundary

- Browser: Playwright desktop Chromium.
- App: the production-built dashboard served by the local Worker.
- API/data: local Wrangler Worker over HTTP with a temporary authenticated cookie and synthetic local D1.
- Delay: a local HTTP proxy delays the first `/api/dashboard` response by `SPARK_ABORT_DELAY_MS` (default 1500ms).
- Safety: no production endpoint, private data, storage state, or seeded database is committed.

## Acceptance criteria

- [x] A real `/api/dashboard` request is observed before navigation changes.
- [x] The delayed request fails in Playwright with an abort/cancel error after the route is superseded.
- [x] The Activity route renders successfully after the superseding navigation.
- [x] The old Dashboard does not paint after the Activity route becomes current.
- [x] The attached acceptance record identifies the delay, request path, failure, and final route.

## Reproduction

Start the local Worker with the safe synthetic D1/session used by the authenticated baseline, then start the proxy:

```sh
SPARK_ABORT_PROXY_TARGET=http://127.0.0.1:8787 \
SPARK_ABORT_PROXY_PORT=8788 \
SPARK_ABORT_DELAY_MS=1500 \
node apps/web/e2e/support/delayed-worker-proxy.mjs
```

Run the opt-in acceptance test through the proxy:

```sh
SPARK_ABORT_E2E=1 \
SPARK_ABORT_DELAY_MS=1500 \
SPARK_PERF_BASE_URL=http://127.0.0.1:8788 \
SPARK_PERF_STORAGE_STATE=/tmp/spark-local-storage.json \
npm exec --yes pnpm@10.15.1 -- --filter @spark/web exec playwright test e2e/abort-real-network.e2e.ts --project=desktop
```

## Result log

2026-09-10 passed against the local Worker over real HTTP through the delayed proxy:

```json
{
  "delayMs": 1500,
  "delayedPath": "/api/dashboard",
  "requestUrl": "http://127.0.0.1:8788/api/dashboard?window=7d",
  "failure": "net::ERR_ABORTED",
  "finalRoute": "http://127.0.0.1:8788/app/activity",
  "staleDashboardPainted": false
}
```

The run passed in 1.2s. It closes E1's delayed real-network proof; it does not close item 3 caching or authorize item 4 yet.

## Follow-up after a pass

1. Keep the delayed proxy and acceptance test as a regression gate; keep it opt-in so the normal suite does not require a local Worker or credentials.
2. Finish item 3 caching/SWR and its privacy, invalidation, freshness, and focus gates.
3. Only after items 1–3 are complete, start item 4 / CP3 on a new stackable branch from PR #90.
