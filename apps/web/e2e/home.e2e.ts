import { expect, test } from '@playwright/test';

test('home leads with change overview and needs-attention queue', async ({ page }) => {
  await page.goto('/app?window=7d&attention=ALL');

  const overview = page.getByTestId('change-overview');
  await expect(overview).toBeVisible();
  await expect(overview.getByText('Observed PRs', { exact: true })).toBeVisible();
  await expect(overview.getByText('Evaluations', { exact: true })).toBeVisible();
  await expect(overview.getByText('Need attention', { exact: true })).toBeVisible();
  await expect(overview.getByText('Merged unresolved', { exact: true })).toBeVisible();

  const queue = page.getByTestId('needs-attention');
  await expect(queue).toBeVisible();
  await expect(queue.getByRole('heading', { name: 'Needs attention' })).toBeVisible();
  await expect(queue.getByRole('link').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent activity' })).toBeVisible();
});

test('home overview follows the selected time window', async ({ page }) => {
  await page.goto('/app?window=7d&attention=ALL');
  await expect(page.getByTestId('change-overview')).toBeVisible();

  await page.getByTestId('window-24h').click();
  await expect(page).toHaveURL(/window=24h/);
  await expect(page.getByTestId('change-overview')).toBeVisible();
  await expect(page.getByTestId('activity-view')).toBeVisible();
});

test('installed repositories with no observed activity show onboarding', async ({ page }) => {
  await page.goto('/app?fixture=empty&window=7d&attention=ALL');
  await expect(page.getByTestId('onboarding-no-history')).toBeVisible();
  await expect(page.getByText('STATIC EXAMPLE · NOT YOUR DATA', { exact: true })).toBeVisible();
  await expect(page.getByText('Spark is connected. The first change will start the story.')).toBeVisible();
});
