import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const screenshotDir = 'test-results/screenshots';
mkdirSync(screenshotDir, { recursive: true });

const suffix = (project: string) => project === 'mobile' ? 'mobile' : 'desktop';

test('signed-out state', async ({ page }) => {
  await page.goto('/app?fixture=signed-out');
  await expect(page.getByTestId('signed-out')).toBeVisible();
  await expect(page.getByTestId('sign-in')).toHaveText('Sign in with GitHub');
});

test('loading state has stable shell', async ({ page }) => {
  await page.goto('/app?fixture=loading');
  await expect(page.getByTestId('loading')).toBeVisible();
});

test('activity renders and captures screenshot', async ({ page }, testInfo) => {
  await page.goto('/app?window=7d&attention=ALL');
  await expect(page.getByTestId('activity-view')).toBeVisible();
  await expect(page.locator('.evaluation-row')).toHaveCount(5);
  await page.screenshot({ path: `${screenshotDir}/activity-${suffix(testInfo.project.name)}.png`, fullPage: true });
});

test('attention, time, and repository filters are URL-owned', async ({ page }) => {
  await page.goto('/app?window=7d&attention=ALL');
  await page.getByTestId('attention-HIGH').click();
  await expect(page).toHaveURL(/attention=HIGH/);
  await expect(page.locator('.evaluation-row')).toHaveCount(1);

  await page.getByTestId('window-30d').click();
  await expect(page).toHaveURL(/window=30d/);
  await expect(page.locator('.evaluation-row')).toHaveCount(2);

  await page.getByTestId('repository-select').selectOption('303');
  await expect(page).toHaveURL(/repositoryId=303/);
  await expect(page.locator('.evaluation-row')).toHaveCount(1);
});

test('filtered empty state can reset attention', async ({ page }) => {
  await page.goto('/app?window=24h&attention=HIGH&repositoryId=202');
  await expect(page.getByTestId('empty-result')).toBeVisible();
  await page.getByRole('button', { name: 'Show all attention' }).click();
  await expect(page).toHaveURL(/attention=ALL/);
  await expect(page.locator('.evaluation-row')).toHaveCount(1);
});

test('API error state is explicit', async ({ page }) => {
  await page.goto('/app?fixture=error');
  await expect(page.getByTestId('api-error')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});

test('evaluation detail renders and links to GitHub', async ({ page }, testInfo) => {
  await page.goto('/app?window=7d&attention=ALL');
  await page.getByRole('link', { name: /HIGH: API authentication changes/ }).click();
  await expect(page.getByTestId('evaluation-detail')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'API authentication changes' })).toBeVisible();
  await expect(page.getByText('integration-test')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open GitHub PR' })).toHaveAttribute('href', /^https:\/\/github\.com\//);
  await expect(page.getByRole('link', { name: 'Open full Spark Check' })).toHaveAttribute('href', /^https:\/\/github\.com\//);
  await page.screenshot({ path: `${screenshotDir}/detail-${suffix(testInfo.project.name)}.png`, fullPage: true });
});

test('legacy evaluation has a truthful unavailable state', async ({ page }) => {
  await page.goto('/app?window=30d&attention=ALL');
  await page.getByRole('link', { name: /Initial repository mapping/ }).click();
  await expect(page.getByTestId('detail-unavailable')).toBeVisible();
  await expect(page.getByText('Historical detail unavailable')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open GitHub PR' })).toBeVisible();
});

test('back navigation preserves activity filters', async ({ page }) => {
  await page.goto('/app?window=24h&attention=HIGH');
  await page.locator('.evaluation-row').first().click();
  await expect(page.getByTestId('evaluation-detail')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/window=24h/);
  await expect(page).toHaveURL(/attention=HIGH/);
  await expect(page.getByTestId('attention-HIGH')).toHaveAttribute('aria-pressed', 'true');
});
