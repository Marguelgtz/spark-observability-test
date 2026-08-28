import { expect, test } from '@playwright/test';

const metrics = [
  ['pull-requests', 'Observed pull requests'],
  ['evaluations', 'Evaluations'],
  ['attention', 'Needs attention'],
  ['merged-unresolved', 'Merged unresolved'],
] as const;

test('home metrics are clickable, render charts, and flag unresolved merges in recent activity', async ({ page }) => {
  await page.goto('/app?window=7d&attention=ALL');

  await expect(page.getByTestId('home-charts')).toBeVisible();
  await expect(page.getByTestId('overview-card-pull-requests')).toHaveAttribute('href', /\/app\/overview\/pull-requests/);
  await expect(page.getByTestId('overview-card-evaluations')).toHaveAttribute('href', /\/app\/overview\/evaluations/);
  await expect(page.getByTestId('overview-card-attention')).toHaveAttribute('href', /\/app\/overview\/attention/);
  await expect(page.getByTestId('overview-card-merged-unresolved')).toHaveAttribute('href', /\/app\/overview\/merged-unresolved/);

  const mergedRecent = page.getByTestId('pull-request-101-42');
  await expect(mergedRecent.getByText('Merged unresolved', { exact: true })).toBeVisible();

  await page.getByTestId('overview-card-evaluations').click();
  await expect(page).toHaveURL(/\/app\/overview\/evaluations\?window=7d/);
  await expect(page.getByTestId('overview-evaluations')).toBeVisible();
  await expect(page.getByTestId('overview-charts')).toBeVisible();
});

for (const [metric, heading] of metrics) {
  test(`${metric} has a dedicated drilldown page`, async ({ page }) => {
    await page.goto(`/app/overview/${metric}?window=7d&attention=ALL`);
    await expect(page.getByTestId(`overview-${metric}`)).toBeVisible();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByTestId('overview-charts')).toBeVisible();
    await expect(page.getByRole('link', { name: '← Change overview' })).toBeVisible();
  });
}

test('overview drilldowns retain time-window navigation', async ({ page }) => {
  await page.goto('/app/overview/pull-requests?window=7d&attention=ALL');
  await page.getByTestId('overview-window-24h').click();
  await expect(page).toHaveURL(/\/app\/overview\/pull-requests\?window=24h/);
  await expect(page.getByTestId('overview-pull-requests')).toBeVisible();
});
