import { expect, test } from '@playwright/test';

test('pull request exposes deterministic behavior inside trajectory without changing page order', async ({ page }) => {
  await page.goto('/app/repositories/101/pulls/42?window=7d&attention=ALL');

  const behavior = page.getByTestId('change-behavior');
  await expect(behavior).toBeVisible();
  await expect(behavior.getByRole('heading', { name: 'Observed behavior', exact: true })).toBeVisible();
  await expect(behavior.getByText('Evaluations', { exact: true })).toBeVisible();
  await expect(behavior.getByText('Peak attention', { exact: true })).toBeVisible();
  await expect(behavior.getByText('Behavior signatures', { exact: true })).toBeVisible();

  const trajectory = page.getByRole('heading', { name: 'Trajectory', exact: true }).locator('..');
  await expect(trajectory.locator('[data-testid="change-behavior"]')).toBeVisible();

  const pageRoot = page.getByTestId('pull-request-detail');
  const order = await pageRoot.evaluate((element) => {
    const children = [...element.children];
    const indexByHeading = (name: string) => children.findIndex((child) =>
      [...child.querySelectorAll('h2')].some((heading) => heading.textContent?.trim() === name));
    return {
      evaluationHistory: indexByHeading('Evaluation history'),
      keyMoments: children.findIndex((child) => child.getAttribute('data-testid') === 'key-moments'),
      forensics: children.findIndex((child) => child.getAttribute('data-testid') === 'pr-forensics'),
    };
  });
  expect(order.evaluationHistory).toBeGreaterThan(-1);
  expect(order.keyMoments).toBeGreaterThan(order.evaluationHistory);
  expect(order.forensics).toBeGreaterThan(order.keyMoments);
});

test('change outcomes exposes recurring behavior counts and concrete PR examples', async ({ page }) => {
  await page.goto('/app/overview/merged-unresolved?window=7d&attention=ALL');

  const section = page.getByTestId('recurring-behaviors');
  await expect(section).toBeVisible();
  await expect(section.getByRole('heading', { name: 'Recurring behaviors', exact: true })).toBeVisible();
  await expect(section.getByText('Evidence regression followed by recovery', { exact: true })).toBeVisible();
  await expect(section.getByText(/occurrences across \d+ PR/)).toBeVisible();
  await expect(section.getByText(/known merge outcome/)).toBeVisible();
  await expect(section.getByText('Examples', { exact: true })).toBeVisible();
  await expect(section.locator('a[data-router-link="true"]')).not.toHaveCount(0);
});
