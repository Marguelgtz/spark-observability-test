import { expect, test } from '@playwright/test';

test('account view exposes GitHub access management', async ({ page }) => {
  await page.goto('/app/account');
  await expect(page.getByText('@Marguelgtz')).toBeVisible();
  await expect(page.getByText('Accessible repositories')).toBeVisible();
  await expect(page.getByText('App installations')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Refresh GitHub access' })).toHaveAttribute('href', '/auth/github?return_to=%2Fapp%2Faccount');
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByRole('link', { name: '← Dashboard' })).toHaveAttribute('href', '/app');
  // R8.2: account is a top-level page reached from the dashboard, so the Dashboard nav
  // item is active (the nav is never left unhighlighted on a top-level/fallback page).
  await expect(page.locator('a.shell-nav-link[data-nav="dashboard"]')).toHaveAttribute('aria-current', 'page');
});

test('viewer identity opens account management', async ({ page }) => {
  await page.goto('/app');
  await page.getByRole('link', { name: 'Open account settings' }).click();
  await expect(page).toHaveURL(/\/app\/account$/);
  await expect(page.getByText('@Marguelgtz')).toBeVisible();
});

test('not-found route keeps the Dashboard nav item active', async ({ page }) => {
  await page.goto('/app/definitely-not-a-route');
  await expect(page.getByRole('link', { name: 'Open activity' })).toBeVisible();
  // R8.2: the fallback page still highlights the Dashboard (home) nav item.
  await expect(page.locator('a.shell-nav-link[data-nav="dashboard"]')).toHaveAttribute('aria-current', 'page');
});
