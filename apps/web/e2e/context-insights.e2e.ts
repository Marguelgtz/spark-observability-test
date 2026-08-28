import { expect, test } from '@playwright/test';

test('restores temporal volume bars on Home and Evaluations', async ({ page }) => {
  await page.goto('/app?window=7d&attention=ALL');

  const homeVolume = page.getByTestId('home-evaluation-volume');
  await expect(homeVolume).toBeVisible();
  await expect(homeVolume).toHaveAttribute('data-chart-kind', 'bar');
  await expect(homeVolume.getByText('Evaluation volume', { exact: true })).toBeVisible();

  await page.goto('/app/overview/evaluations?window=7d&attention=ALL');
  const evaluationVolume = page.getByTestId('overview-evaluation-volume');
  await expect(evaluationVolume).toBeVisible();
  await expect(evaluationVolume).toHaveAttribute('data-chart-kind', 'bar');
  await expect(evaluationVolume.getByText('Evaluation volume', { exact: true })).toBeVisible();
});

test('pull request trajectory graphs attention severity through immutable evaluations', async ({ page }) => {
  await page.goto('/app/repositories/101/pulls/42?window=7d&attention=ALL');

  const chart = page.getByTestId('pr-severity-timeline');
  await expect(chart).toBeVisible();
  await expect(chart.getByText('Attention severity over time', { exact: true })).toBeVisible();
  await expect(chart.locator('.pr-severity-point')).toHaveCount(3);
  await expect(chart.locator('svg')).toHaveAttribute('aria-label', /Attention severity over time:/);
  await expect(chart.getByText('Each point is an immutable Spark evaluation; vertical moves show attention-level transitions.', { exact: true })).toBeVisible();
});
