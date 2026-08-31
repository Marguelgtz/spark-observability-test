import { expect, test } from '@playwright/test';

const metrics = [
  ['pull-requests', 'Observed pull requests'],
  ['evaluations', 'Evaluations'],
  ['attention', 'Needs attention'],
  ['merged-unresolved', 'Change outcomes'],
] as const;

test('dashboard metrics drill into existing views and operational signals stay in one canvas', async ({ page }) => {
  await page.goto('/app?window=7d&attention=ALL');

  await expect(page.getByTestId('dashboard-card-attention')).toHaveAttribute('href', /\/app\/overview\/attention/);
  await expect(page.getByTestId('dashboard-card-active')).toHaveAttribute('href', /\/app\/overview\/pull-requests/);
  await expect(page.getByTestId('dashboard-card-merged-unresolved')).toHaveAttribute('href', /\/app\/overview\/merged-unresolved/);
  await expect(page.getByTestId('dashboard-card-recoveries')).toHaveAttribute('href', /\/app\/overview\/merged-unresolved.*#outcome-stabilization/);

  await page.getByTestId('recent-activity').locator('summary').click();
  const mergedRecent = page.getByTestId('recent-change-101-42');
  await expect(mergedRecent).toBeVisible();
  await expect(mergedRecent.getByText('Merged unresolved', { exact: true })).toBeVisible();

  const signals = page.getByTestId('dashboard-signal-canvas');
  await expect(signals).toBeVisible();
  await expect(page.getByTestId('dashboard-signal-flow')).toBeVisible();
  await expect(page.getByTestId('dashboard-signal-flow').locator('[data-chart-kind="line"]')).toHaveAttribute('data-scale-mode', 'dual');
  await signals.getByRole('tab', { name: 'Iteration' }).click();
  await expect(page.getByTestId('dashboard-signal-iteration').locator('[data-chart-kind="histogram"]')).toBeVisible();
  await signals.getByRole('tab', { name: 'Behavior' }).click();
  await expect(page.getByTestId('dashboard-signal-behavior').locator('[data-chart-kind="horizontal-bar"]')).toBeVisible();

  await page.getByTestId('dashboard-card-attention').click();
  await expect(page).toHaveURL(/\/app\/overview\/attention\?window=7d/);
  await expect(page.getByTestId('overview-attention')).toBeVisible();
  await expect(page.getByTestId('overview-charts')).toBeVisible();
});

for (const [metric, heading] of metrics) {
  test(`${metric} has a dedicated drilldown page`, async ({ page }) => {
    await page.goto(`/app/overview/${metric}?window=7d&attention=ALL`);
    await expect(page.getByTestId(`overview-${metric}`)).toBeVisible();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByTestId(metric === 'merged-unresolved' ? 'outcome-charts' : 'overview-charts')).toBeVisible();
    await expect(page.getByRole('link', { name: '← Change overview' })).toBeVisible();
  });
}

test('drilldown canvases pair graph forms to the metric context', async ({ page }) => {
  await page.goto('/app/overview/pull-requests?window=7d&attention=ALL');
  let charts = page.getByTestId('overview-charts');
  await expect(page.getByTestId('insight-canvas-pull-request-flow')).toBeVisible();
  const pullRequestFlow = page.getByTestId('pull-request-flow-trend');
  await expect(pullRequestFlow).toHaveAttribute('data-scale-mode', 'dual');
  await expect(pullRequestFlow.locator('.insight-line-axis-title.series-1')).toHaveText('Evaluations');
  await expect(pullRequestFlow.locator('.insight-line-axis-title.series-2')).toHaveText('PRs observed');
  await expect(page.getByTestId('insight-canvas-portfolio-shape')).toBeVisible();
  await expect(charts.locator('[data-chart-kind="line"]')).toBeVisible();
  await expect(charts.locator('[data-chart-kind="horizontal-bar"]')).toHaveCount(2);
  await expect(charts.locator('[data-chart-kind="donut"]')).toBeVisible();
  await expect(page.getByTestId('notable-transition-mix')).toBeVisible();

  await page.goto('/app/overview/evaluations?window=7d&attention=ALL');
  charts = page.getByTestId('overview-charts');
  await expect(page.getByTestId('insight-canvas-evaluation-flow')).toBeVisible();
  await expect(page.getByTestId('insight-canvas-iteration-density')).toBeVisible();
  await expect(page.getByTestId('insight-canvas-evaluation-attention')).toBeVisible();
  await expect(charts.locator('[data-chart-kind="line"]')).toBeVisible();
  await expect(charts.locator('[data-chart-kind="bar"]')).toBeVisible();
  await expect(charts.locator('[data-chart-kind="histogram"]')).toBeVisible();
  await expect(charts.locator('[data-chart-kind="stacked-bar"]')).toBeVisible();
  await expect(charts.locator('[data-chart-kind="donut"]')).toBeVisible();
  await expect(page.getByTestId('notable-transition-mix')).toBeVisible();

  const evaluationFlow = page.getByTestId('evaluation-flow-trend');
  await expect(evaluationFlow).toHaveAttribute('data-scale-mode', 'dual');
  await expect(evaluationFlow.locator('.insight-line-axis-title.series-1')).toHaveText('Evaluations');
  await expect(evaluationFlow.locator('.insight-line-axis-title.series-2')).toHaveText('PRs observed');
  await expect(evaluationFlow.locator('.insight-line-axis.series-1')).toHaveCount(4);
  await expect(evaluationFlow.locator('.insight-line-axis.series-2')).toHaveCount(4);
  await expect(evaluationFlow.locator('.insight-line-axis-title.series-1')).toHaveCSS('fill', 'rgb(47, 95, 135)');
  await expect(evaluationFlow.locator('.insight-line-axis-title.series-2')).toHaveCSS('fill', 'rgb(155, 107, 31)');
  await expect(evaluationFlow.locator('.insight-line-series.series-1')).toHaveCSS('stroke', 'rgb(47, 95, 135)');
  await expect(evaluationFlow.locator('.insight-line-series.series-2')).toHaveCSS('stroke', 'rgb(155, 107, 31)');

  await page.goto('/app/overview/attention?window=7d&attention=ALL');
  charts = page.getByTestId('overview-charts');
  await expect(page.getByTestId('insight-canvas-current-attention')).toBeVisible();
  await expect(page.getByTestId('insight-canvas-recovery-behavior')).toBeVisible();
  await expect(charts.locator('[data-chart-kind="donut"]')).toBeVisible();
  await expect(charts.locator('[data-chart-kind="horizontal-bar"]')).toBeVisible();
  await expect(page.getByTestId('regression-recovery-chart')).toBeVisible();
  await expect(page.getByTestId('attention-transition-chart')).toBeVisible();

  await page.goto('/app/overview/merged-unresolved?window=7d&attention=ALL');
  charts = page.getByTestId('outcome-charts');
  await expect(page.getByTestId('insight-canvas-outcome-merge-quality')).toBeVisible();
  await expect(page.getByTestId('insight-canvas-outcome-pre-merge-state')).toBeVisible();
  await expect(page.getByTestId('insight-canvas-outcome-stabilization')).toBeVisible();
  await expect(page.getByTestId('insight-canvas-outcome-feedback')).toBeVisible();
  await expect(page.getByTestId('insight-canvas-outcome-stabilization')).toHaveAttribute('id', 'outcome-stabilization');
  await expect(charts.locator('[data-chart-kind="stacked-bar"]')).toBeVisible();
  await expect(charts.locator('[data-chart-kind="line"]')).toBeVisible();
  await expect(charts.locator('[data-chart-kind="donut"]')).toHaveCount(3);
  await expect(charts.locator('[data-chart-kind="horizontal-bar"]')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Unresolved merges', exact: true })).toBeVisible();
  await expect(page.getByText(/Full resolved and unavailable merge denominators/)).toBeVisible();
});

test('recovery metric enters the recovery section without conflating merge totals', async ({ page }) => {
  await page.goto('/app?window=7d&attention=ALL');
  await expect(page.getByTestId('dashboard-card-recoveries')).toContainText('PRs in 7d');
  await page.getByTestId('dashboard-card-recoveries').click();
  await expect(page).toHaveURL(/\/app\/overview\/merged-unresolved.*#outcome-stabilization/);
  await expect(page.getByTestId('insight-canvas-outcome-stabilization')).toBeInViewport();
  await expect(page.getByText(/dashboard “Merged unresolved” card/)).toBeVisible();
});

test('overview drilldowns retain time-window navigation', async ({ page }) => {
  await page.goto('/app/overview/pull-requests?window=7d&attention=ALL');
  await page.getByTestId('overview-window-24h').click();
  await expect(page).toHaveURL(/\/app\/overview\/pull-requests\?window=24h/);
  await expect(page.getByTestId('overview-pull-requests')).toBeVisible();
});
