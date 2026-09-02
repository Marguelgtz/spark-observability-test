import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const screenshotDir = 'test-results/repository-understanding-ui-audit';
mkdirSync(screenshotDir, { recursive: true });

const viewport = (project: string) => project === 'mobile' ? 'mobile-390x844' : 'desktop-1440x900';

async function capture(page: Page, state: string, project: string) {
  const positiveTabIndexes = await page.locator('[tabindex]').evaluateAll(elements => elements
    .map(element => Number(element.getAttribute('tabindex')))
    .filter(value => Number.isFinite(value) && value > 0));
  expect(positiveTabIndexes).toEqual([]);
  await page.screenshot({ path: `${screenshotDir}/${state}-${viewport(project)}.png`, fullPage: true });
}

test('captures activity compatibility baseline', async ({ page }, testInfo) => {
  await page.goto('/app/activity?window=7d&attention=ALL');
  await expect(page.getByTestId('activity-view')).toBeVisible();
  await expect(page.getByText('HIGH', { exact: true }).first()).toBeVisible();
  await expect(page.locator('.evaluation-row').first()).toContainText('auth/security');
  await capture(page, 'activity', testInfo.project.name);
});

test('captures pull-request trajectory and forensic terminology baseline', async ({ page }, testInfo) => {
  await page.goto('/app/repositories/101/pulls/42?window=7d&attention=ALL');
  await expect(page.getByTestId('pull-request-detail')).toBeVisible();
  const forensics = page.getByTestId('pr-forensics');
  const disclosure = forensics.locator('summary');
  await disclosure.focus();
  await page.keyboard.press('Enter');
  await expect(disclosure).toBeFocused();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(page.getByRole('heading', { name: 'Observations', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Evidence issues', exact: true })).toBeVisible();
  await capture(page, 'pull-request-trajectory', testInfo.project.name);
});

test('captures evaluation-detail compatibility baseline', async ({ page }, testInfo) => {
  await page.goto('/app/repositories/101/runs/fixture%3A101%3A42%3A0?window=7d&attention=ALL');
  await expect(page.getByTestId('evaluation-detail')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Directly changed', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Potentially affected', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Evidence', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Repository context', exact: true })).toBeVisible();
  await capture(page, 'evaluation-detail', testInfo.project.name);
});

test('captures truthful historical-unavailable baseline', async ({ page }, testInfo) => {
  await page.goto('/app/evaluations/101/aa37f103fb3838b5192dd31259b3755700000037?window=30d&attention=ALL');
  await expect(page.getByTestId('detail-unavailable')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Historical detail unavailable', exact: true })).toBeVisible();
  await expect(page.getByText(/attention and PR identity were retained/i)).toBeVisible();
  await capture(page, 'historical-unavailable', testInfo.project.name);
});
