import { expect, test } from '@playwright/test';

test('pull request keeps deterministic behavior available as progressive diagnostic depth', async ({ page }) => {
  await page.goto('/app/repositories/101/pulls/42?window=7d&attention=ALL');

  const behavior = page.getByTestId('change-behavior');
  await expect(behavior).toBeVisible();
  await expect(behavior.getByRole('heading', { name: 'Observed behavior', exact: true })).toBeVisible();
  await expect(behavior).not.toHaveAttribute('open', '');
  await expect(behavior.getByText('Show behavior details', { exact: true })).toBeVisible();
  await behavior.locator('.behavior-disclosure-summary').click();
  await expect(behavior).toHaveAttribute('open', '');

  const attentionJourney = behavior.getByTestId('behavior-attention-journey');
  await expect(attentionJourney).toBeVisible();
  await expect(attentionJourney).toHaveAttribute('aria-label', /Attention started .* peaked .* and is now/);
  await expect(attentionJourney.getByText('Initial', { exact: true })).toBeVisible();
  await expect(attentionJourney.getByText('Peak', { exact: true })).toBeVisible();
  await expect(attentionJourney.getByText('Latest', { exact: true })).toBeVisible();

  await expect(behavior.getByText('Observed journey', { exact: true })).toBeVisible();
  await expect(behavior.locator('.behavior-boundary')).not.toHaveCount(0);
  await expect(behavior.getByText('Evaluations', { exact: true })).toBeVisible();
  await expect(behavior.getByText('Regressions', { exact: true })).toBeVisible();
  await expect(behavior.getByText('Recoveries', { exact: true })).toBeVisible();
  await expect(behavior.getByText('Inspect deterministic signatures', { exact: true })).toBeVisible();

  const pageRoot = page.getByTestId('pull-request-detail');
  const order = await pageRoot.evaluate((element) => {
    const children = [...element.children];
    const indexByHeading = (name: string) => children.findIndex((child) =>
      [...child.querySelectorAll('h2')].some((heading) => heading.textContent?.trim() === name));
    return {
      evaluationHistory: indexByHeading('Evaluation history'),
      keyMoments: children.findIndex((child) => child.getAttribute('data-testid') === 'key-moments'),
      behavior: children.findIndex((child) => child.getAttribute('data-testid') === 'change-behavior'),
      forensics: children.findIndex((child) => child.getAttribute('data-testid') === 'pr-forensics'),
    };
  });
  expect(order.evaluationHistory).toBeGreaterThan(-1);
  expect(order.keyMoments).toBeLessThan(order.evaluationHistory);
  expect(order.behavior).toBeGreaterThan(order.evaluationHistory);
  expect(order.forensics).toBeGreaterThan(order.behavior);
});

test('change outcomes exposes recurring behavior prevalence, outcomes, and concrete PR examples', async ({ page }) => {
  await page.goto('/app/overview/merged-unresolved?window=7d&attention=ALL');

  const section = page.getByTestId('recurring-behaviors');
  await expect(section).toBeVisible();
  await expect(section.getByRole('heading', { name: 'Recurring behaviors', exact: true })).toBeVisible();
  await expect(section.getByText('Observed PRs', { exact: true })).toBeVisible();
  await expect(section.getByRole('heading', { name: 'Recurring motifs', exact: true })).toBeVisible();
  await expect(section.getByText('Evidence regression followed by recovery', { exact: true })).toBeVisible();
  await expect(section.getByText(/occurrences across \d+ PR/)).toBeVisible();
  await expect(section.getByText('Observed PR prevalence', { exact: true })).toBeVisible();
  await expect(section.locator('.behavior-prevalence-meter')).toBeVisible();
  await expect(section.locator('.behavior-outcome-bar')).toHaveAttribute('role', 'img');
  await expect(section.getByText(/known merge outcome/)).toBeVisible();
  await expect(section.getByText('Examples', { exact: true })).toBeVisible();
  await expect(section.locator('a[data-router-link="true"]')).not.toHaveCount(0);
});
