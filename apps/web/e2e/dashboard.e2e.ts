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

test('dashboard, activity, and settings are distinct primary routes', async ({ page }) => {
  await page.goto('/app?window=7d&attention=ALL');
  await expect(page.getByTestId('change-overview')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('activity-search')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Recent activity', exact: true })).toBeVisible();
  await page.getByTestId('recent-activity').locator('summary').click();
  await expect(page.getByRole('link', { name: 'View all activity →', exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Activity', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/activity/);
  await expect(page.getByTestId('activity-view')).toBeVisible();
  await expect(page.getByTestId('activity-search')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Activity', exact: true })).toHaveAttribute('aria-current', 'page');

  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/settings/);
  await expect(page.getByTestId('settings-view')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Settings', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('legacy activity-only dashboard query redirects to activity and preserves filters', async ({ page }) => {
  await page.goto('/app?window=7d&attention=HIGH&q=checkout&favorites=1');
  await expect(page).toHaveURL(/\/app\/activity\?window=7d&attention=HIGH&q=checkout&favorites=1/);
  await expect(page.getByTestId('activity-search')).toHaveValue('checkout');
  await expect(page.getByTestId('favorites-only')).toHaveAttribute('aria-pressed', 'true');
});

test('activity renders one row per pull request and captures screenshot', async ({ page }, testInfo) => {
  await page.goto('/app/activity?window=7d&attention=ALL');
  await expect(page.getByTestId('activity-view')).toBeVisible();
  await expect(page.locator('.evaluation-row')).toHaveCount(5);
  await page.screenshot({ path: `${screenshotDir}/activity-${suffix(testInfo.project.name)}.png`, fullPage: true });
});

test('pull request history expands into a horizontal evaluation rail', async ({ page }, testInfo) => {
  await page.goto('/app/activity?window=7d&attention=ALL');
  const toggle = page.getByTestId('history-toggle-101-42');
  await expect(toggle).toContainText('3');
  await expect(page.getByTestId('history-toggle-202-120')).toHaveClass(/is-singular/);
  await toggle.click();
  const history = page.getByTestId('history-101-42');
  await expect(history).toBeVisible();
  await expect(history.locator('.history-card')).toHaveCount(3);
  await expect(history.getByText('3 runs')).toBeVisible();
  await expect(history.getByText('Latest')).toHaveCount(1);
  await page.screenshot({ path: `${screenshotDir}/history-${suffix(testInfo.project.name)}.png`, fullPage: true });
});

test('attention, time, and repository filters are URL-owned', async ({ page }) => {
  await page.goto('/app/activity?window=7d&attention=ALL');
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

test('search and favorites filter the activity view and survive reload', async ({ page }) => {
  await page.goto('/app/activity?window=7d&attention=ALL');
  const search = page.getByTestId('activity-search');
  await search.fill('checkout');
  await expect(page).toHaveURL(/q=checkout/);
  await expect(page.locator('.evaluation-row')).toHaveCount(2);
  await page.getByRole('link', { name: 'Open pull request 120: Checkout integration' }).click();
  await expect(page).toHaveURL(/q=checkout/);
  await page.goBack();
  await expect(page.getByTestId('activity-search')).toHaveValue('checkout');

  await page.getByTestId('activity-search').fill('');
  await page.getByRole('button', { name: 'Favorite pull request #42' }).click();
  await page.getByTestId('favorites-only').click();
  await expect(page).toHaveURL(/favorites=1/);
  await expect(page.locator('.evaluation-row')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Open pull request 42: API authentication changes' })).toBeVisible();

  await page.reload();
  await expect(page.locator('.evaluation-row')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Remove pull request #42 from favorites' })).toBeVisible();
});

test('same-SHA evaluations can be favorited independently by run ID', async ({ page }) => {
  await page.goto('/app/activity?window=7d&attention=ALL');
  await page.getByTestId('history-toggle-101-42').click();
  const history = page.getByTestId('history-101-42');
  const favorites = history.locator('.favorite-button');
  await expect(favorites).toHaveCount(3);
  await favorites.nth(1).click();
  await expect(favorites.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(favorites.nth(0)).toHaveAttribute('aria-pressed', 'false');

  await page.reload();
  await page.getByTestId('history-toggle-101-42').click();
  await expect(page.getByTestId('history-101-42').locator('.favorite-button').nth(1)).toHaveAttribute('aria-pressed', 'true');
});

test('filtered empty state can reset attention', async ({ page }) => {
  await page.goto('/app/activity?window=24h&attention=HIGH&repositoryId=202');
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
  await page.goto('/app/activity?window=7d&attention=ALL');
  await page.getByRole('link', { name: 'Open pull request 42: API authentication changes' }).click();
  await expect(page.getByTestId('pull-request-detail')).toBeVisible();
  await expect(page).toHaveURL(/\/app\/repositories\/101\/pulls\/42/);
  await expect(page.getByRole('link', { name: '← Activity' })).toHaveAttribute('href', /\/app\/activity\?window=7d&attention=ALL/);
  await expect(page.getByRole('heading', { name: 'API authentication changes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Key moments', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Trajectory', exact: true })).toBeVisible();
  const forensics = page.getByTestId('pr-forensics');
  await expect(forensics).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Observations', exact: true })).not.toBeVisible();
  await forensics.getByText('Forensic details', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Observations', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Evaluation history', exact: true })).toBeVisible();
  await expect(page.locator('.pr-run')).toHaveCount(3);
  await page.screenshot({ path: `${screenshotDir}/pull-request-${suffix(testInfo.project.name)}.png`, fullPage: true });
});

test('Key moments combine and explain causes at each material run boundary', async ({ page }) => {
  await page.goto('/app/repositories/101/pulls/42?window=7d&attention=ALL');

  const transitions = page.getByTestId('notable-transition');
  await expect(transitions).toHaveCount(2);
  const latestTransition = transitions.nth(1);
  await expect(latestTransition.getByText('Attention increased to HIGH', { exact: true })).toBeVisible();
  await expect(latestTransition).toContainText('integration-test: pending → failed');
  await expect(latestTransition).toContainText('Sensitive surface added: auth/security');
  await expect(page.getByText('3 runs analyzed', { exact: true })).toBeVisible();
});

test('material transition feedback is accessible, editable, and survives reload', async ({ page }) => {
  await page.goto('/app/repositories/101/pulls/42?window=7d&attention=ALL');

  const trigger = page.getByTestId('transition-feedback-trigger').first();
  await expect(trigger).toHaveAttribute('aria-label', 'Give Spark feedback on this transition');
  await trigger.click();
  const drawer = page.getByTestId('transition-feedback-drawer');
  await drawer.getByLabel('Optional feedback context').fill('Helped identify the failing integration check.');
  await drawer.getByRole('button', { name: 'Useful', exact: true }).click();
  await drawer.getByRole('button', { name: 'Save feedback', exact: true }).click();
  await expect(drawer.getByRole('status')).toHaveText('Saved as Useful');
  await expect(drawer.getByRole('button', { name: 'Useful', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('Escape');
  await page.reload();
  const restoredTrigger = page.getByTestId('transition-feedback-trigger').first();
  await expect(restoredTrigger).toHaveAttribute('aria-label', 'Edit Spark feedback on this transition');
  await restoredTrigger.click();
  const restored = page.getByTestId('transition-feedback-drawer');
  await expect(restored.getByRole('button', { name: 'Useful', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(restored.getByLabel('Optional feedback context')).toHaveValue('Helped identify the failing integration check.');
  await restored.getByRole('button', { name: 'Fixed because of Spark', exact: true }).click();
  await restored.getByRole('button', { name: 'Save feedback', exact: true }).click();
  await expect(restored.getByRole('status')).toHaveText('Saved as Fixed because of Spark');
});

test('merged trajectory shows the selected pre-merge state as a terminal marker', async ({ page }) => {
  await page.goto('/app/repositories/101/pulls/42?window=7d&attention=ALL');

  const terminal = page.getByTestId('lifecycle-terminal');
  await expect(terminal).toBeVisible();
  await expect(terminal.getByText('Merged · HIGH', { exact: true })).toBeVisible();
  await expect(terminal.getByText('Merged with unresolved attention', { exact: true })).toBeVisible();
  await expect(terminal.getByText(/selected pre-merge observation was HIGH with failed evidence/i)).toBeVisible();
  await expect(terminal.getByText('Unresolved at merge', { exact: true })).toBeVisible();
});

test('pull request page drills into latest immutable run and keeps PR context', async ({ page }, testInfo) => {
  await page.goto('/app/repositories/101/pulls/42?window=7d&attention=ALL');
  await page.getByRole('link', { name: 'View latest evaluation' }).click();
  await expect(page.getByTestId('evaluation-detail')).toBeVisible();
  await expect(page).toHaveURL(/\/app\/repositories\/101\/runs\/fixture%3A101%3A42%3A0/);
  await expect(page.getByRole('heading', { name: 'API authentication changes' })).toBeVisible();
  await expect(page.getByText('integration-test', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '← PR #42' })).toBeVisible();
  await expect(page.getByText(/Evaluation 3 of 3/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open GitHub PR' })).toHaveAttribute('href', /^https:\/\/github\.com\//);
  await expect(page.getByRole('link', { name: 'Open full Spark Check' })).toHaveAttribute('href', /^https:\/\/github\.com\//);
  await page.screenshot({ path: `${screenshotDir}/detail-${suffix(testInfo.project.name)}.png`, fullPage: true });
});

test('same SHA observations remain individually inspectable by run ID', async ({ page }) => {
  await page.goto('/app/activity?window=7d&attention=ALL');
  await page.getByTestId('history-toggle-101-42').click();
  const history = page.getByTestId('history-101-42');
  const cards = history.locator('.history-card');
  await expect(cards).toHaveCount(3);

  const shaLabels = await cards.locator('code').allTextContents();
  expect(new Set(shaLabels).size).toBe(1);

  await cards.nth(1).click();
  await expect(page.getByTestId('evaluation-detail')).toBeVisible();
  await expect(page).toHaveURL(/\/app\/repositories\/101\/runs\/fixture%3A101%3A42%3A1/);
  await expect(page.locator('.evidence-status').first()).toHaveText('PENDING');
  await expect(page.getByRole('link', { name: '← Previous' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Next →' })).toBeVisible();

  await page.getByRole('link', { name: 'Next →' }).click();
  await expect(page).toHaveURL(/\/app\/repositories\/101\/runs\/fixture%3A101%3A42%3A0/);
  await expect(page.getByText('integration-test', { exact: true })).toBeVisible();
  await expect(page.locator('.evidence-status.evidence-failed')).toHaveCount(2);
});

test('legacy SHA route remains latest-by-SHA compatibility', async ({ page }) => {
  const sha = 'a42c11e7b8f2d61f963831db8200deaffeed0042';
  await page.goto(`/app/evaluations/101/${sha}?window=7d&attention=ALL`);
  await expect(page.getByTestId('evaluation-detail')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/app/evaluations/101/${sha}`));
  await expect(page.getByText('integration-test', { exact: true })).toBeVisible();
  await expect(page.getByText('FAILED', { exact: true })).toBeVisible();
});

test('legacy evaluation has a truthful unavailable state through the PR page', async ({ page }) => {
  await page.goto('/app/activity?window=30d&attention=ALL');
  await page.getByRole('link', { name: 'Open pull request 37: Initial repository mapping' }).click();
  await expect(page.getByTestId('pull-request-detail')).toBeVisible();
  await page.getByRole('link', { name: 'View latest evaluation' }).click();
  await expect(page.getByTestId('detail-unavailable')).toBeVisible();
  await expect(page.getByText('Historical detail unavailable')).toBeVisible();
  await expect(page.getByText(/reconstructed from Spark's previously retained latest-per-SHA history/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open GitHub PR' })).toBeVisible();
});

test('back navigation preserves activity filters through the PR layer', async ({ page }) => {
  await page.goto('/app/activity?window=24h&attention=HIGH');
  await page.locator('.evaluation-main-link').first().click();
  await expect(page.getByTestId('pull-request-detail')).toBeVisible();
  await expect(page.getByRole('link', { name: '← Activity' })).toHaveAttribute('href', /\/app\/activity\?window=24h&attention=HIGH/);
  await page.goBack();
  await expect(page).toHaveURL(/window=24h/);
  await expect(page).toHaveURL(/attention=HIGH/);
  await expect(page.getByTestId('attention-HIGH')).toHaveAttribute('aria-pressed', 'true');
});
