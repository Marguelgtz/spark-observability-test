import { expect, test } from '@playwright/test';

test('dashboard signals expose flow and iteration in one canvas', async ({ page }) => {
  await page.goto('/app?window=7d&attention=ALL');
  await expect(page.getByTestId('dashboard-trend-snapshot')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open full evaluation trends →', exact: true })).toHaveAttribute('href', /\/app\/overview\/evaluations/);
  const signalCanvas = page.getByTestId('dashboard-signal-canvas');
  const flowTab = signalCanvas.getByRole('tab', { name: 'Flow' });
  await expect(flowTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('dashboard-signal-flow').locator('[data-chart-kind="line"]')).toHaveAttribute('data-scale-mode', 'dual');
  await flowTab.focus();
  await flowTab.press('ArrowRight');
  await expect(signalCanvas.getByRole('tab', { name: 'Attention' })).toHaveAttribute('aria-selected', 'true');
  await signalCanvas.getByRole('tab', { name: 'Iteration' }).click();
  await expect(page.getByTestId('dashboard-signal-iteration').locator('[data-chart-kind="histogram"]')).toBeVisible();
  await expect(page.getByTestId('dashboard-signal-iteration')).toContainText('evaluations per PR');

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
