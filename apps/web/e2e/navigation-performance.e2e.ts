import { expect, test, type Page, type Request, type Response } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type RequestSample = {
  id: number;
  scenario: string;
  method: string;
  url: string;
  path: string;
  resourceType: string;
  startedAtMs: number;
  status?: number;
  ttfbMs?: number;
  durationMs?: number;
  responseBodyBytes?: number;
  contentLengthBytes?: number;
  cacheStatus?: string;
  completedAtMs?: number;
  failure?: string;
  canceled: boolean;
};

type ScenarioSample = {
  name: string;
  startedAt: string;
  routeBlockingMs: number;
  observationWindowMs: number;
  requestCount: number;
  applicationRequestCount: number;
  duplicateRequests: Array<{ key: string; count: number }>;
  runningAfterPaint: string[];
  canceledRequestCount: number;
  responseBodyBytes: number;
  contentLengthBytes: number;
  requests: RequestSample[];
};

const enabled = process.env.SPARK_PERF === '1';
const outputDirectory = resolve('test-results/navigation-performance');
const settleMs = readPositiveInteger('SPARK_PERF_SETTLE_MS', 1_000);
const revisitDelays = readDelayList(process.env.SPARK_PERF_REVISIT_DELAYS ?? '5000,30000,60000');
const useFixture = !process.env.SPARK_PERF_BASE_URL;

function readPositiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function readDelayList(value: string): number[] {
  const delays = value.split(',').map((part) => Number(part.trim()));
  if (!delays.length || delays.some((delay) => !Number.isFinite(delay) || delay < 0)) {
    throw new Error('SPARK_PERF_REVISIT_DELAYS must be a comma-separated list of non-negative milliseconds');
  }
  return delays;
}

function dashboardPath(): string {
  const params = new URLSearchParams({ window: '7d', attention: 'ALL' });
  if (useFixture) params.set('fixture', process.env.SPARK_PERF_FIXTURE ?? 'normal');
  return `/app?${params.toString()}`;
}

function requestPath(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

function numericHeader(headers: Record<string, string>, name: string): number | undefined {
  const value = Number(headers[name]);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function isApplicationRequest(sample: RequestSample): boolean {
  return sample.path.startsWith('/api/') || sample.path.startsWith('/auth/') || sample.path === '/health';
}

class NavigationRecorder {
  readonly #page: Page;
  readonly #clockStartedAt = Date.now();
  readonly #records = new Map<Request, RequestSample>();
  readonly #active = new Set<Request>();
  readonly #finalizers = new Set<Promise<void>>();
  readonly #scenarios: ScenarioSample[] = [];
  #scenario: string | undefined;
  #sequence = 0;

  constructor(page: Page) {
    this.#page = page;
    page.on('request', (request) => this.#onRequest(request));
    page.on('response', (response) => this.#onResponse(response));
    page.on('requestfinished', (request) => {
      const finalizer = this.#onFinished(request);
      this.#finalizers.add(finalizer);
      void finalizer.finally(() => this.#finalizers.delete(finalizer));
    });
    page.on('requestfailed', (request) => this.#onFailed(request));
  }

  async measure(name: string, action: () => Promise<unknown>, ready: () => Promise<unknown>): Promise<void> {
    console.log(`[navigation-performance] start ${name}`);
    await this.#waitForNetworkQuiet();
    this.#scenario = name;
    const startedAt = new Date().toISOString();
    const started = performance.now();

    await action();
    await ready();

    const routeBlockingMs = Math.round(performance.now() - started);
    const runningAfterPaint = [...this.#active]
      .map((request) => this.#records.get(request))
      .filter((sample): sample is RequestSample => sample?.scenario === name)
      .map((sample) => sample.path)
      .sort();

    await this.#page.waitForTimeout(settleMs);
    this.#scenario = undefined;
    await this.#waitForRequestFinalizers();

    const requests = [...this.#records.values()].filter((sample) => sample.scenario === name);
    const duplicates = new Map<string, number>();
    for (const sample of requests) {
      const key = `${sample.method} ${sample.path}`;
      duplicates.set(key, (duplicates.get(key) ?? 0) + 1);
    }

    this.#scenarios.push({
      name,
      startedAt,
      routeBlockingMs,
      observationWindowMs: routeBlockingMs + settleMs,
      requestCount: requests.length,
      applicationRequestCount: requests.filter(isApplicationRequest).length,
      duplicateRequests: [...duplicates]
        .filter(([, count]) => count > 1)
        .map(([key, count]) => ({ key, count })),
      runningAfterPaint,
      canceledRequestCount: requests.filter((sample) => sample.canceled).length,
      responseBodyBytes: requests.reduce((sum, sample) => sum + (sample.responseBodyBytes ?? 0), 0),
      contentLengthBytes: requests.reduce((sum, sample) => sum + (sample.contentLengthBytes ?? 0), 0),
      requests,
    });
    console.log(`[navigation-performance] complete ${name}: ${requests.length} requests, ${routeBlockingMs} ms blocking`);
  }

  report(baseURL: string | undefined): object {
    return {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      baseURL,
      authenticatedStorageState: Boolean(process.env.SPARK_PERF_STORAGE_STATE),
      fixture: useFixture ? (process.env.SPARK_PERF_FIXTURE ?? 'normal') : undefined,
      settleMs,
      revisitDelaysMs: revisitDelays,
      environment: {
        node: process.version,
        project: 'desktop',
      },
      scenarios: this.#scenarios,
    };
  }

  #onRequest(request: Request): void {
    if (!this.#scenario) return;
    const sample: RequestSample = {
      id: ++this.#sequence,
      scenario: this.#scenario,
      method: request.method(),
      url: request.url(),
      path: requestPath(request.url()),
      resourceType: request.resourceType(),
      startedAtMs: Date.now() - this.#clockStartedAt,
      canceled: false,
    };
    this.#records.set(request, sample);
    this.#active.add(request);
  }

  #onResponse(response: Response): void {
    const sample = this.#records.get(response.request());
    if (!sample) return;
    const timing = response.request().timing();
    const headers = response.headers();
    sample.status = response.status();
    sample.ttfbMs = timing.responseStart >= 0 ? Math.round(timing.responseStart) : undefined;
    sample.contentLengthBytes = numericHeader(headers, 'content-length');
    sample.cacheStatus = headers['cf-cache-status'];
  }

  async #onFinished(request: Request): Promise<void> {
    const sample = this.#records.get(request);
    this.#active.delete(request);
    if (!sample) return;
    const timing = request.timing();
    sample.durationMs = timing.responseEnd >= 0 ? Math.round(timing.responseEnd) : undefined;
    sample.completedAtMs = Date.now() - this.#clockStartedAt;
    try {
      const response = await request.response();
      if (response) sample.responseBodyBytes = (await response.body()).byteLength;
    } catch {
      // Redirects and browser-served responses do not always expose a body. The
      // content-length and Resource Timing fields remain available when supplied.
    }
  }

  #onFailed(request: Request): void {
    const sample = this.#records.get(request);
    this.#active.delete(request);
    if (!sample) return;
    sample.completedAtMs = Date.now() - this.#clockStartedAt;
    sample.failure = request.failure()?.errorText ?? 'request failed';
    sample.canceled = /abort|cancel/i.test(sample.failure);
  }

  async #waitForNetworkQuiet(): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (this.#active.size && Date.now() < deadline) await this.#page.waitForTimeout(25);
  }

  async #waitForRequestFinalizers(): Promise<void> {
    await Promise.all([...this.#finalizers]);
  }
}

async function showDashboard(page: Page): Promise<void> {
  await expect(page.getByTestId('change-overview')).toBeVisible();
}

async function startFromDashboard(page: Page): Promise<void> {
  await page.goto(dashboardPath(), { waitUntil: 'domcontentloaded' });
  await showDashboard(page);
}

test.skip(!enabled, 'Set SPARK_PERF=1 or run pnpm measure:navigation to capture navigation metrics.');

test('records the navigation performance baseline', async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Performance capture uses the fixed desktop project.');
  if (!useFixture && !process.env.SPARK_PERF_STORAGE_STATE) {
    throw new Error('SPARK_PERF_STORAGE_STATE must point to a temporary authenticated Playwright state for remote capture');
  }
  test.setTimeout(revisitDelays.reduce((sum, delay) => sum + delay, 0) + 180_000);
  page.setDefaultTimeout(15_000);

  const recorder = new NavigationRecorder(page);

  await recorder.measure(
    'dashboard:cold',
    () => page.goto(dashboardPath(), { waitUntil: 'domcontentloaded' }),
    () => showDashboard(page),
  );

  await recorder.measure(
    'dashboard-to-activity',
    () => page.getByRole('link', { name: 'Activity', exact: true }).click(),
    () => expect(page.getByTestId('activity-view')).toBeVisible(),
  );
  await recorder.measure(
    'activity-to-dashboard',
    () => page.getByRole('link', { name: 'Dashboard', exact: true }).click(),
    () => showDashboard(page),
  );

  await recorder.measure(
    'dashboard-to-needs-attention',
    () => page.getByTestId('dashboard-card-attention').click(),
    () => expect(page.getByTestId('overview-attention')).toBeVisible(),
  );
  await recorder.measure(
    'needs-attention-to-dashboard',
    () => page.getByRole('link', { name: '← Change overview', exact: true }).click(),
    () => showDashboard(page),
  );

  await recorder.measure(
    'dashboard-to-pull-request',
    () => page.getByTestId('needs-attention').locator('a.dashboard-change-row').first().click(),
    () => expect(page.getByTestId('pull-request-detail')).toBeVisible(),
  );
  await recorder.measure(
    'pull-request-to-dashboard',
    () => page.goBack(),
    () => showDashboard(page),
  );

  for (const delay of revisitDelays) {
    await startFromDashboard(page);
    await page.getByRole('link', { name: 'Activity', exact: true }).click();
    await expect(page.getByTestId('activity-view')).toBeVisible();
    await page.waitForTimeout(delay);
    await recorder.measure(
      `dashboard-revisit-after-${delay}ms`,
      () => page.getByRole('link', { name: 'Dashboard', exact: true }).click(),
      () => showDashboard(page),
    );
  }

  const report = recorder.report(baseURL);
  mkdirSync(outputDirectory, { recursive: true });
  const safeTimestamp = new Date().toISOString().replaceAll(':', '-');
  const outputPath = resolve(outputDirectory, `navigation-${safeTimestamp}.json`);
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await testInfo.attach('navigation-performance.json', {
    body: Buffer.from(JSON.stringify(report, null, 2)),
    contentType: 'application/json',
  });

  expect((report as { scenarios: ScenarioSample[] }).scenarios).toHaveLength(7 + revisitDelays.length);
});
