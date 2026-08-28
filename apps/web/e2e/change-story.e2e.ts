import { expect, test } from '@playwright/test';

test('pull request page keeps analysis first and change evolution at the bottom', async ({ page }) => {
  await page.goto('/app/repositories/101/pulls/42?window=7d&attention=ALL');

  const moments = page.getByTestId('key-moments');
  await expect(moments).toBeVisible();
  await expect(moments.getByRole('heading', { name: 'Key moments', exact: true })).toBeVisible();
  await expect(moments.getByText('Attention changes stay visible; evaluations at the same attention level are grouped for inspection.', { exact: true })).toBeVisible();

  const items = moments.locator('.change-story-item');
  await expect(items).toHaveCount(4);
  await expect(items.nth(0)).toHaveAttribute('data-story-kind', 'INITIAL');
  await expect(items.nth(1)).toHaveAttribute('data-story-kind', 'TRANSITION');
  await expect(items.nth(2)).toHaveAttribute('data-story-kind', 'TRANSITION');
  await expect(items.nth(3)).toHaveAttribute('data-story-kind', 'TERMINAL');

  await expect(moments.getByText('Attention increased to MEDIUM', { exact: true })).toBeVisible();
  await expect(moments.getByText('Attention increased to HIGH', { exact: true })).toBeVisible();
  await expect(moments.getByText('Merged with unresolved attention', { exact: true })).toBeVisible();
  await expect(moments.getByTestId('transition-feedback-trigger')).toHaveCount(2);
  await expect(page.getByTestId('transition-feedback-drawer')).toHaveCount(0);

  await expect(page.getByTestId('insight-canvas-pr-trajectory')).toBeVisible();

  const forensics = page.getByTestId('pr-forensics');
  await expect(forensics).toBeVisible();
  await expect(forensics).not.toHaveAttribute('open', '');

  const prPage = page.getByTestId('pull-request-detail');
  await expect(prPage.evaluate((element) => element.lastElementChild?.getAttribute('data-testid'))).resolves.toBe('key-moments');

  await expect(page.getByRole('heading', { name: 'Observations', exact: true })).not.toBeVisible();
  await forensics.getByText('Forensic details', { exact: true }).click();
  await expect(forensics).toHaveAttribute('open', '');
  await expect(page.getByRole('heading', { name: 'Observations', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Evidence issues', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Evaluation history', exact: true })).toBeVisible();
  await expect(page.locator('.pr-run')).toHaveCount(3);
});

test('material transition feedback uses a tooltip trigger and contextual drawer and survives reload', async ({ page }) => {
  await page.goto('/app/repositories/101/pulls/42?window=7d&attention=ALL');

  const transition = page.getByTestId('notable-transition').first();
  const trigger = transition.getByTestId('transition-feedback-trigger');
  await expect(trigger).toHaveAttribute('aria-label', 'Give Spark feedback on this transition');
  await expect(trigger).toHaveAttribute('data-tooltip', 'Give Spark feedback on this transition');
  await trigger.click();

  const drawer = page.getByTestId('transition-feedback-drawer');
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute('role', 'dialog');
  await expect(drawer.getByRole('heading', { name: 'Feedback on this transition', exact: true })).toBeVisible();
  await expect(drawer.getByText('Attention increased to MEDIUM', { exact: true })).toBeVisible();
  await drawer.getByLabel('Optional feedback context').fill('Key moment feedback context.');
  await drawer.getByRole('button', { name: 'Useful', exact: true }).click();
  await expect(drawer.getByRole('button', { name: 'Useful', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await drawer.getByRole('button', { name: 'Save feedback', exact: true }).click();
  await expect(drawer.getByRole('status')).toHaveText('Saved as Useful');
  await expect(trigger).toHaveAttribute('aria-label', 'Edit Spark feedback on this transition');

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('transition-feedback-drawer')).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await page.reload();
  const restoredTrigger = page.getByTestId('notable-transition').first().getByTestId('transition-feedback-trigger');
  await expect(restoredTrigger).toHaveAttribute('aria-label', 'Edit Spark feedback on this transition');
  await restoredTrigger.click();
  const restoredDrawer = page.getByTestId('transition-feedback-drawer');
  await expect(restoredDrawer.getByRole('button', { name: 'Useful', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(restoredDrawer.getByLabel('Optional feedback context')).toHaveValue('Key moment feedback context.');
});
