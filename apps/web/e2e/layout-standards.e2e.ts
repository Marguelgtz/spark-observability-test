import { expect, test } from '@playwright/test';

async function expectNoViewportOverflow(page: import('@playwright/test').Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
}

test('routes use analytics, standard, and reading rails without viewport overflow', async ({ page }, testInfo) => {
  await page.goto('/app?window=7d&attention=ALL');
  const dashboard = page.getByTestId('dashboard-view');
  await expect(dashboard).toBeVisible();
  const dashboardWidth = (await dashboard.boundingBox())?.width ?? 0;
  expect(dashboardWidth).toBeCloseTo(testInfo.project.name === 'mobile' ? 358 : 1180, 0);
  await expectNoViewportOverflow(page);

  await page.goto('/app/repositories/101/pulls/42?window=7d&attention=ALL');
  const pullRequest = page.getByTestId('pull-request-detail');
  await expect(pullRequest).toBeVisible();
  const pullRequestWidth = (await pullRequest.boundingBox())?.width ?? 0;
  expect(pullRequestWidth).toBeCloseTo(testInfo.project.name === 'mobile' ? 358 : 980, 0);
  await expectNoViewportOverflow(page);

  await page.goto('/app/repositories/101/runs/fixture%3A101%3A42%3A0?window=7d&attention=ALL');
  const detail = page.locator('.detail-content');
  await expect(detail).toBeVisible();
  const detailWidth = (await detail.boundingBox())?.width ?? 0;
  expect(detailWidth).toBeCloseTo(testInfo.project.name === 'mobile' ? 358 : 760, 0);
  await expectNoViewportOverflow(page);
});
