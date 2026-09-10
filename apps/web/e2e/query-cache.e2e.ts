import { expect, test } from '@playwright/test';

test('reuses fresh route data and keeps stale focus refresh skeleton-free', async ({ page }) => {
  await page.goto('/app?fixture=normal&window=7d&attention=ALL', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('change-overview')).toBeVisible();

  await page.evaluate(() => {
    let calls = 0;
    const fetch = window.fetch;
    window.fetch = (...args) => {
      calls += 1;
      return fetch(...args);
    };
    Object.defineProperty(window, '__sparkCacheFetchCount', { configurable: true, get: () => calls });
  });
  await page.getByRole('link', { name: 'Activity', exact: true }).click();
  await expect(page.getByTestId('activity-view')).toBeVisible();
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByTestId('change-overview')).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __sparkCacheFetchCount?: number }).__sparkCacheFetchCount)).toBe(0);

  await page.evaluate(() => {
    const current = Date.now;
    Date.now = () => current() + 31_000;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    Date.now = current;
  });
  // Focus/visibility revalidation keeps the retained dashboard visible while
  // the stale entry refreshes in the background.
  await expect(page.getByTestId('change-overview')).toBeVisible();
  await expect(page.getByTestId('loading')).toHaveCount(0);
});
