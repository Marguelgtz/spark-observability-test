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

test('activity renders one row per pull request and captures screenshot', async ({ page }, testInfo) => {
  await page.goto('/app?window=7d&attention=ALL');
  await expect(page.getByTestId('activity-view')).toBeVisible();
  await expect(page.locator('.evaluation-row')).toHaveCount(5);
  await page.screenshot({ path: `${screenshotDir}/activity-${suffix(testInfo.project.name)}.png`, fullPage: true });
});

test('pull request history expands into a horizontal evaluation rail', async ({ page }, testInfo) => {
  await page.goto('/app?window=7d&attention=ALL');
  const toggle = page.getByTestId('history-toggle-101-42');
  await expect(toggle).toContainText('3');
  await toggle.click();
  const history = page.getByTestId('history-101-42');
  await expect(history).toBeVisible();
  await expect(history.locator('.history-card')).toHaveCount(3);
  await expect(history.getByText('3 runs')).toBeVisible();
  await expect(history.getByText('Latest')).toBeVisible();
  await page.screenshot({ path: `${screenshotDir}/history-${suffix(testInfo.project.name)}.png`, fullPage: true });
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

test('activity opens a pull request observability page', async ({ page }, testInfo) => {
  await page.goto('/app?window=7d&attention=ALL');
  await page.getByRole('link', { name: 'Open pull request 42: API authentication changes' }).click();
  await expect(page.getByTestId('pull-request-detail')).toBeVisible();
  await expect(page).toHaveURL(/\/app\/repositories\/101\/pulls\/42/);
  await expect(page.getByRole('heading', { name: 'API authentication changes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Trajectory' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Observations' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Evaluation history' })).toBeVisible();
  await expect(page.locator('.pr-run')).toHaveCount(3);
  await page.screenshot({ path: `${screenshotDir}/pull-request-${suffix(testInfo.project.name)}.png`, fullPage: true });
});

test('pull request page drills into latest evaluation and keeps PR context', async ({ page }, testInfo) => {
  await page.goto('/app/repositories/101/pulls/42?window=7d&attention=ALL');
  await page.getByRole('link', { name: 'View latest evaluation' }).click();
  await expect(page.getByTestId('evaluation-detail')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'API authentication changes' })).toBeVisible();
  await expect(page.getByText('integration-test', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '← PR #42' })).toBeVisible();
  await expect(page.getByText(/Evaluation 3 of 3/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open GitHub PR' })).toHaveAttribute('href', /^https:\/\/github\.com\//);
  await expect(page.getByRole('link', { name: 'Open full Spark Check' })).toHaveAttribute('href', /^https:\/\/github\.com\//);
  await page.screenshot({ path: `${screenshotDir}/detail-${suffix(testInfo.project.name)}.png`, fullPage: true });
});

test('history cards navigate to a specific evaluation SHA with previous and next context', async ({ page }) => {
  await page.goto('/app?window=7d&attention=ALL');
  await page.getByTestId('history-toggle-101-42').click();
  const history = page.getByTestId('history-101-42');
  const older = history.locator('.history-card').nth(1);
  await older.click();
  await expect(page.getByTestId('evaluation-detail')).toBeVisible();
  await expect(page).toHaveURL(/\/app\/evaluations\/101\//);
  await expect(page.getByRole('link', { name: '← Previous' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Next →' })).toBeVisible();
});

test('legacy evaluation has a truthful unavailable state through the PR page', async ({ page }) => {
  await page.goto('/app?window=30d&attention=ALL');
  await page.getByRole('link', { name: 'Open pull request 37: Initial repository mapping' }).click();
  await expect(page.getByTestId('pull-request-detail')).toBeVisible();
  await page.getByRole('link', { name: 'View latest evaluation' }).click();
  await expect(page.getByTestId('detail-unavailable')).toBeVisible();
  await expect(page.getByText('Historical detail unavailable')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open GitHub PR' })).toBeVisible();
});

test('back navigation preserves activity filters through the PR layer', async ({ page }) => {
  await page.goto('/app?window=24h&attention=HIGH');
  await page.locator('.evaluation-main-link').first().click();
  await expect(page.getByTestId('pull-request-detail')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/window=24h/);
  await expect(page).toHaveURL(/attention=HIGH/);
  await expect(page.getByTestId('attention-HIGH')).toHaveAttribute('aria-pressed', 'true');
});
