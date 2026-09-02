import { expect, test, type Page } from '@playwright/test';

const settingsKey = 'spark:fixture:settings:v1:17017482';

async function saveFixtureSettings(page: Page, overrides: Record<string, unknown> = {}) {
  await page.goto('/app/settings');
  await page.evaluate(({ key, values }: { key: string; values: Record<string, unknown> }) => localStorage.setItem(key, JSON.stringify({
    version: 1,
    revision: 1,
    defaultWindow: '24h',
    previewSize: 5,
    density: 'COMPACT',
    collapseSecondarySections: false,
    defaultRepositoryId: 303,
    updatedAt: '2026-08-30T08:00:00.000Z',
    ...values,
  })), { key: settingsKey, values: overrides });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/app/settings');
  await page.evaluate((key) => localStorage.removeItem(key), settingsKey);
});

test('plain routes use saved defaults at shared integration boundaries', async ({ page }) => {
  await saveFixtureSettings(page);
  await page.goto('/app');

  await expect(page.getByTestId('window-24h')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('repository-select')).toHaveValue('303');
  await expect(page.getByTestId('recent-activity')).toHaveAttribute('open', '');
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-density', 'compact');

  await page.getByRole('link', { name: 'Activity', exact: true }).click();
  await expect(page.getByTestId('window-24h')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('repository-select')).toHaveValue('303');
  await expect(page.locator('.evaluation-row').first()).toHaveCSS('padding-top', '9px');
});

test('explicit URL state and All repositories override saved defaults', async ({ page }) => {
  await saveFixtureSettings(page);

  await page.goto('/app?window=30d&repositoryId=202');
  await expect(page.getByTestId('window-30d')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('repository-select')).toHaveValue('202');

  await page.goto('/app?repositoryId=all');
  await expect(page.getByTestId('window-24h')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('repository-select')).toHaveValue('');
  await page.getByTestId('window-7d').click();
  await expect(page).toHaveURL(/repositoryId=all/);
  await expect(page.getByTestId('repository-select')).toHaveValue('');
});

test('saved preview size controls server-backed and retained lists', async ({ page }) => {
  await saveFixtureSettings(page, { defaultWindow: '30d', defaultRepositoryId: null });
  await page.goto('/app/activity');
  await expect(page.getByTestId('activity-progressive-list').locator('[data-progressive-identity]')).toHaveCount(5);

  await page.goto('/app/overview/evaluations');
  await expect(page.getByTestId('overview-progressive-list').locator('[data-progressive-identity]')).toHaveCount(5);

  await page.goto('/app/repositories/101/pulls/42');
  await expect(page.getByTestId('pr-history-progressive-list').locator('[data-progressive-identity]')).toHaveCount(3);
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-density', 'compact');
});

test('detail back-links preserve an explicit All repositories context', async ({ page }) => {
  await saveFixtureSettings(page);
  await page.goto('/app/repositories/101/pulls/42?repositoryId=all');
  const back = page.getByRole('link', { name: '← Activity' });
  await expect(back).toHaveAttribute('href', /\/app\/activity\?.*window=24h/);
  await expect(back).toHaveAttribute('href', /repositoryId=all/);
  await back.click();
  await expect(page.getByTestId('repository-select')).toHaveValue('');
});

test('settings failure falls back without blocking the route', async ({ page }) => {
  await page.goto('/app?settingsFailure=load');
  await expect(page.getByTestId('dashboard-view')).toBeVisible();
  await expect(page.getByTestId('preference-warning')).toContainText('Spark defaults are in use');
  await expect(page.getByTestId('window-7d')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-density', 'comfortable');
  await expect(page.getByTestId('api-error')).toHaveCount(0);
});
