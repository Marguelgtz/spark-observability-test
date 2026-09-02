import { expect, test } from '@playwright/test';

const settingsKey = 'spark:fixture:settings:v1:17017482';

test.beforeEach(async ({ page }) => {
  await page.goto('/app/settings');
  await page.evaluate((key) => localStorage.removeItem(key), settingsKey);
  await page.reload();
});

test('settings use defaults, save explicitly, and persist after reload', async ({ page }) => {
  await expect(page.getByTestId('settings-view')).toBeVisible();
  await expect(page.getByTestId('settings-default-window-7d')).toBeChecked();
  await expect(page.getByTestId('settings-preview-size-15')).toBeChecked();
  await expect(page.getByTestId('settings-density-comfortable')).toBeChecked();
  await expect(page.getByTestId('settings-collapse-secondary')).toBeChecked();
  await expect(page.getByTestId('settings-default-repository')).toHaveValue('');

  await page.getByTestId('settings-default-window-24h').check();
  await page.getByTestId('settings-preview-size-5').check();
  await page.getByTestId('settings-density-compact').check();
  await page.getByTestId('settings-collapse-secondary').uncheck();
  await page.getByTestId('settings-default-repository').selectOption('303');

  await expect(page.getByRole('status').filter({ hasText: 'Preferences saved.' })).toHaveCount(0);
  await page.getByTestId('settings-save').click();
  await expect(page.getByText('Preferences saved.', { exact: true })).toBeVisible();
  await page.reload();

  await expect(page.getByTestId('settings-default-window-24h')).toBeChecked();
  await expect(page.getByTestId('settings-preview-size-5')).toBeChecked();
  await expect(page.getByTestId('settings-density-compact')).toBeChecked();
  await expect(page.getByTestId('settings-collapse-secondary')).not.toBeChecked();
  await expect(page.getByTestId('settings-default-repository')).toHaveValue('303');
});

test('a stale save loads the latest values without overwriting them', async ({ page }) => {
  await page.getByTestId('settings-default-window-24h').check();
  await page.evaluate(({ key }) => localStorage.setItem(key, JSON.stringify({
    version: 1,
    revision: 1,
    defaultWindow: '30d',
    previewSize: 10,
    density: 'COMPACT',
    collapseSecondarySections: false,
    defaultRepositoryId: 202,
    updatedAt: '2026-08-29T12:00:00.000Z',
  })), { key: settingsKey });

  await page.getByTestId('settings-save').click();
  await expect(page.getByText(/latest saved values are shown; review and reapply/i)).toBeVisible();
  await expect(page.getByTestId('settings-default-window-30d')).toBeChecked();
  await expect(page.getByTestId('settings-preview-size-10')).toBeChecked();
  await expect(page.getByTestId('settings-density-compact')).toBeChecked();
  await expect(page.getByTestId('settings-default-repository')).toHaveValue('202');
});

test('settings load failure shows usable defaults instead of a global error', async ({ page }) => {
  await page.goto('/app/settings?settingsFailure=load');
  await expect(page.getByTestId('settings-warning')).toContainText('Safe defaults are shown');
  await expect(page.getByTestId('settings-default-window-7d')).toBeChecked();
  await expect(page.getByTestId('api-error')).toHaveCount(0);
  await expect(page.getByTestId('settings-save')).toBeEnabled();
});

test('settings save failure preserves the current form values', async ({ page }) => {
  await page.goto('/app/settings?settingsFailure=save');
  await page.getByTestId('settings-default-window-24h').check();
  await page.getByTestId('settings-save').click();
  await expect(page.getByText(/could not be saved/i)).toBeVisible();
  await expect(page.getByTestId('settings-default-window-24h')).toBeChecked();
});
