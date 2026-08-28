import { expect, test } from '@playwright/test';

test('pull request page leads with a chronological change story and keeps forensics behind disclosure', async ({ page }) => {
  await page.goto('/app/repositories/101/pulls/42?window=7d&attention=ALL');

  const story = page.getByTestId('change-story');
  await expect(story).toBeVisible();
  await expect(story.getByRole('heading', { name: 'Change story', exact: true })).toBeVisible();

  const items = story.locator('.change-story-item');
  await expect(items).toHaveCount(4);
  await expect(items.nth(0)).toHaveAttribute('data-story-kind', 'INITIAL');
  await expect(items.nth(1)).toHaveAttribute('data-story-kind', 'TRANSITION');
  await expect(items.nth(2)).toHaveAttribute('data-story-kind', 'TRANSITION');
  await expect(items.nth(3)).toHaveAttribute('data-story-kind', 'TERMINAL');

  await expect(story.getByText('Attention increased to MEDIUM', { exact: true })).toBeVisible();
  await expect(story.getByText('Attention increased to HIGH', { exact: true })).toBeVisible();
  await expect(story.getByText('Merged with unresolved attention', { exact: true })).toBeVisible();
  await expect(story.getByTestId('transition-feedback')).toHaveCount(2);

  const forensics = page.getByTestId('pr-forensics');
  await expect(forensics).toBeVisible();
  await expect(forensics).not.toHaveAttribute('open', '');
  await expect(page.getByRole('heading', { name: 'Observations', exact: true })).not.toBeVisible();
  await forensics.getByText('Forensic details', { exact: true }).click();
  await expect(forensics).toHaveAttribute('open', '');
  await expect(page.getByRole('heading', { name: 'Observations', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Evidence issues', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Evaluation history', exact: true })).toBeVisible();
  await expect(page.locator('.pr-run')).toHaveCount(3);
});

test('story transition feedback stays attached to its material transition and survives reload', async ({ page }) => {
  await page.goto('/app/repositories/101/pulls/42?window=7d&attention=ALL');

  const transition = page.getByTestId('notable-transition').first();
  const feedback = transition.getByTestId('transition-feedback');
  await feedback.getByText('Add optional context', { exact: true }).click();
  await feedback.getByLabel('Optional feedback context').fill('Story node feedback context.');
  await feedback.getByRole('button', { name: 'Useful', exact: true }).click();
  await expect(feedback.getByRole('status')).toHaveText('Saved as Useful');

  await page.reload();
  const restored = page.getByTestId('notable-transition').first().getByTestId('transition-feedback');
  await expect(restored.getByRole('button', { name: 'Useful', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await restored.getByText('Edit optional context', { exact: true }).click();
  await expect(restored.getByLabel('Optional feedback context')).toHaveValue('Story node feedback context.');
});
