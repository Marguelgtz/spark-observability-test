import { expect, test } from '@playwright/test';

test('dashboard exposes operational metrics, signals, and action queues', async ({ page }) => {
  await page.goto('/app?window=7d&attention=ALL');

  const overview = page.getByTestId('change-overview');
  await expect(overview).toBeVisible();
  await expect(overview.getByText('Needs attention', { exact: true })).toBeVisible();
  await expect(overview.getByText('Active changes', { exact: true })).toBeVisible();
  await expect(overview.getByText('Merged unresolved', { exact: true })).toBeVisible();
  await expect(overview.getByText('Recent recoveries', { exact: true })).toBeVisible();
  await expect(page.getByTestId('dashboard-card-recoveries')).toHaveAttribute('href', /#outcome-stabilization$/);

  const queue = page.getByTestId('needs-attention');
  await expect(queue).toBeVisible();
  await expect(queue.getByRole('heading', { name: 'Needs attention' })).toBeVisible();
  await expect(queue.getByRole('link').first()).toBeVisible();

  const active = page.getByTestId('active-changes');
  await expect(active).toHaveAttribute('open', '');
  await expect(active.getByRole('heading', { name: 'Active changes' })).toBeVisible();
  await expect(page.getByTestId('active-change-101-42')).toHaveCount(0);

  const recent = page.getByTestId('recent-activity');
  await expect(recent).not.toHaveAttribute('open', '');
  await recent.locator('summary').click();
  await expect(page.getByRole('link', { name: 'View all activity →', exact: true })).toBeVisible();

  await expect(page.getByTestId('dashboard-signals')).toBeVisible();
  await expect(page.getByTestId('dashboard-signal-canvas')).toBeVisible();
});

test('dashboard filters update URL-owned operational context', async ({ page }) => {
  await page.goto('/app?window=7d&attention=ALL');
  await expect(page.getByTestId('change-overview')).toBeVisible();

  await page.getByTestId('window-24h').click();
  await expect(page).toHaveURL(/window=24h/);
  await expect(page.getByTestId('dashboard-view')).toBeVisible();
  await expect(page.getByTestId('change-overview')).toBeVisible();

  await page.getByTestId('repository-select').selectOption('303');
  await expect(page).toHaveURL(/repositoryId=303/);
  await expect(page.getByTestId('dashboard-view')).toBeVisible();
});

test('recent activity failure does not blank the operational dashboard', async ({ page }) => {
  await page.goto('/app?fixture=normal&dashboardFailure=recent&window=7d&attention=ALL');
  await expect(page.getByTestId('change-overview')).toBeVisible();
  await expect(page.getByTestId('needs-attention')).toBeVisible();
  await expect(page.getByTestId('active-changes')).toBeVisible();
  await page.getByTestId('recent-activity').locator('summary').click();
  await expect(page.getByText('Recent activity could not be loaded. The operational summary above is still current.')).toBeVisible();
});

test('signals failure remains isolated from operational queues', async ({ page }) => {
  await page.goto('/app?fixture=normal&dashboardFailure=insights&window=7d&attention=ALL');
  await expect(page.getByTestId('change-overview')).toBeVisible();
  await expect(page.getByTestId('needs-attention')).toBeVisible();
  await expect(page.getByTestId('dashboard-signals')).toBeVisible();
  await expect(page.getByText('Operational signals could not be loaded because evaluation trends are unavailable. Operational queues are unaffected.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry operational signals' })).toBeVisible();
});

test('installed repositories with no observed activity show onboarding', async ({ page }) => {
  await page.goto('/app?fixture=empty&window=7d&attention=ALL');
  await expect(page.getByTestId('onboarding-no-history')).toBeVisible();
  await expect(page.getByText('STATIC EXAMPLE · NOT YOUR DATA', { exact: true })).toBeVisible();
  await expect(page.getByText('Spark is connected. The first change will start the story.')).toBeVisible();
});
