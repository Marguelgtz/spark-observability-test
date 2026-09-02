import { expect, test } from '@playwright/test';

test('preserves temporal volume bars and adds iteration density canvases', async ({ page }) => {
  await page.goto('/app?window=7d&attention=ALL');
  const snapshot = page.getByTestId('dashboard-trend-snapshot');
  await expect(snapshot).toBeVisible();
  await expect(page.getByTestId('dashboard-trend-charts')).toBeVisible();
  await expect(page.getByTestId('insight-canvas-dashboard-volume')).toBeVisible();
  await expect(page.getByTestId('insight-canvas-dashboard-attention')).toBeVisible();
  await expect(page.getByTestId('insight-canvas-dashboard-movement')).toBeVisible();
  await expect(page.getByTestId('dashboard-evaluation-volume')).toHaveAttribute('data-chart-kind', 'bar');
  await expect(page.getByTestId('dashboard-current-attention')).toHaveAttribute('data-chart-kind', 'donut');
  await expect(page.getByTestId('dashboard-transition-mix')).toHaveAttribute('data-chart-kind', 'horizontal-bar');
  await expect(page.getByRole('link', { name: 'Explore trends →', exact: true })).toHaveAttribute('href', /\/app\/overview\/evaluations/);

  const dashboardInsights = page.getByTestId('dashboard-insights');
  await expect(dashboardInsights).not.toHaveAttribute('open', '');
  await expect(page.getByTestId('home-charts')).not.toBeVisible();
  await dashboardInsights.locator('summary').click();

  const throughput = page.getByTestId('insight-canvas-throughput-iteration');
  await expect(throughput).toBeVisible();
  const homeVolume = page.getByTestId('home-evaluation-volume');
  await expect(homeVolume).toBeVisible();
  await expect(homeVolume).toHaveAttribute('data-chart-kind', 'bar');
  await expect(page.getByTestId('iteration-density-histogram')).toHaveAttribute('data-chart-kind', 'histogram');
  await expect(throughput.locator('.insight-canvas-interpretation')).toContainText('evaluations per PR');

  await page.goto('/app/overview/evaluations?window=7d&attention=ALL');
  const evaluationVolume = page.getByTestId('overview-evaluation-volume');
  await expect(evaluationVolume).toBeVisible();
  await expect(evaluationVolume).toHaveAttribute('data-chart-kind', 'bar');
  await expect(page.getByTestId('insight-canvas-iteration-density')).toBeVisible();
  await expect(page.getByTestId('iteration-density-histogram')).toHaveAttribute('data-chart-kind', 'histogram');
});

test('pull request trajectory pairs severity through time with transition causes', async ({ page }) => {
  await page.goto('/app/repositories/101/pulls/42?window=7d&attention=ALL');

  const canvas = page.getByTestId('insight-canvas-pr-trajectory');
  await expect(canvas).toBeVisible();
  const chart = page.getByTestId('pr-severity-timeline');
  await expect(chart).toBeVisible();
  await expect(chart).toHaveAttribute('data-chart-kind', 'stepped-line');
  await expect(chart.getByText('Attention severity over time', { exact: true })).toBeVisible();
  await expect(chart.locator('.insight-step-point')).toHaveCount(3);
  await expect(chart.locator('svg')).toHaveAttribute('aria-label', /Attention severity over time:/);
  await expect(page.getByTestId('pr-transition-summary')).toBeVisible();
  await expect(canvas.locator('.insight-canvas-interpretation')).toContainText('3 evaluations');
});
