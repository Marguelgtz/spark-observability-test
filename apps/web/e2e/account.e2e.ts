import { expect, test } from '@playwright/test';

test('account view exposes GitHub access management', async ({ page }) => {
  await page.goto('/app/account');
  await expect(page.getByText('@Marguelgtz')).toBeVisible();
  await expect(page.getByText('Accessible repositories')).toBeVisible();
  await expect(page.getByText('App installations')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Refresh GitHub access' })).toHaveAttribute('href', '/auth/github?return_to=%2Fapp%2Faccount');
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByRole('link', { name: '← Dashboard' })).toHaveAttribute('href', '/app');
});

test('viewer identity opens account management', async ({ page }) => {
  await page.goto('/app');
  await page.getByRole('link', { name: 'Open account settings' }).click();
  await expect(page).toHaveURL(/\/app\/account$/);
  await expect(page.getByText('@Marguelgtz')).toBeVisible();
});
