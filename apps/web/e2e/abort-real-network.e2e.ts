import { expect, test, type Request } from '@playwright/test';

const enabled = process.env.SPARK_ABORT_E2E === '1';
const delayMs = Number(process.env.SPARK_ABORT_DELAY_MS ?? 1500);

test.skip(!enabled, 'Set SPARK_ABORT_E2E=1 with a delayed Worker proxy and authenticated storage state.');

test('aborts a delayed real Worker request when navigation supersedes the route', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The delayed network acceptance uses the fixed desktop project.');
  if (!process.env.SPARK_PERF_STORAGE_STATE) {
    throw new Error('SPARK_PERF_STORAGE_STATE must point to a temporary authenticated Playwright state');
  }
  if (!Number.isFinite(delayMs) || delayMs < 500) {
    throw new Error('SPARK_ABORT_DELAY_MS must be at least 500ms for the cancellation window');
  }

  page.setDefaultTimeout(15_000);
  let delayedDashboardRequest: Request | undefined;
  let delayedDashboardFailure: string | undefined;
  let sawDelayedDashboardRequest: (() => void) | undefined;
  const delayedRequestSeen = new Promise<void>((resolve) => { sawDelayedDashboardRequest = resolve; });
  const cancellationSeen = new Promise<void>((resolve) => {
    page.on('requestfailed', (request) => {
      if (new URL(request.url()).pathname !== '/api/dashboard') return;
      delayedDashboardFailure = request.failure()?.errorText;
      if (delayedDashboardRequest) resolve();
    });
  });
  page.on('request', (request) => {
    if (new URL(request.url()).pathname !== '/api/dashboard' || delayedDashboardRequest) return;
    delayedDashboardRequest = request;
    sawDelayedDashboardRequest?.();
  });

  const initialNavigation = page.goto('/app?window=7d&attention=ALL', { waitUntil: 'commit' }).catch(() => undefined);
  await Promise.race([
    delayedRequestSeen,
    page.waitForTimeout(5_000).then(() => { throw new Error('Timed out waiting for delayed /api/dashboard request'); }),
  ]);
  await page.waitForTimeout(Math.min(250, Math.max(100, delayMs / 4)));

  // Use the app's SPA navigation path so the route controller—not a full document
  // teardown—owns the cancellation we are proving.
  await page.getByRole('link', { name: 'Activity', exact: true }).click();
  await expect(page.getByTestId('activity-view')).toBeVisible();
  await initialNavigation;

  await Promise.race([
    cancellationSeen,
    page.waitForTimeout(5_000).then(() => { throw new Error('Delayed /api/dashboard request did not report cancellation'); }),
  ]);
  expect(delayedDashboardFailure ?? '').toMatch(/abort|cancel|ERR_ABORTED/i);
  await expect(page.getByTestId('change-overview')).toHaveCount(0);
  const acceptance = {
    delayMs,
    delayedPath: '/api/dashboard',
    requestUrl: delayedDashboardRequest?.url(),
    failure: delayedDashboardFailure,
    finalRoute: page.url(),
    staleDashboardPainted: await page.getByTestId('change-overview').count() > 0,
  };
  console.log(`[abort-acceptance] ${JSON.stringify(acceptance)}`);
  await testInfo.attach('abort-acceptance.json', {
    body: Buffer.from(JSON.stringify(acceptance, null, 2)),
    contentType: 'application/json',
  });
});
