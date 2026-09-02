import { expect, test } from '@playwright/test';

test('client-backed lists honor 5/10/15 batches and collapse without refetching', async ({ page }) => {
  await page.goto('/');
  for (const previewSize of [5, 10, 15] as const) {
    await page.evaluate(async (size) => {
      const { progressiveList } = await import('/src/progressive-list.ts');
      const items = Array.from({ length: 23 }, (_, index) => ({ id: index + 1 }));
      const list = progressiveList({
        items,
        total: items.length,
        previewSize: size,
        identity: (item) => String(item.id),
        renderItem: (item) => {
          const row = document.createElement('button');
          row.textContent = `Item ${item.id}`;
          return row;
        },
      });
      list.id = 'progressive-test';
      document.body.replaceChildren(list);
    }, previewSize);

    const list = page.locator('#progressive-test');
    await expect(list.locator('[data-progressive-identity]')).toHaveCount(previewSize);
    await list.getByRole('button', { name: `Show ${Math.min(previewSize, 23 - previewSize)} more` }).click();
    await expect(list.locator('[data-progressive-identity]')).toHaveCount(Math.min(previewSize * 2, 23));
    await list.getByRole('button', { name: 'Show less' }).click();
    await expect(list.locator('[data-progressive-identity]')).toHaveCount(previewSize);
  }
});

test('server-backed lists preserve rows, retry, deduplicate, focus appended content, and reuse loaded pages', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { progressiveList } = await import('/src/progressive-list.ts');
    const initial = Array.from({ length: 5 }, (_, index) => ({ id: index + 1 }));
    let calls = 0;
    const list = progressiveList({
      items: initial,
      total: 12,
      nextCursor: 'first',
      previewSize: 5,
      identity: (item) => String(item.id),
      renderItem: (item) => {
        const row = document.createElement('button');
        row.textContent = `Item ${item.id}`;
        return row;
      },
      loadMore: async (cursor) => {
        calls += 1;
        document.body.dataset.calls = String(calls);
        if (calls === 1) throw new Error('offline');
        if (cursor === 'first') {
          return { items: [5, 6, 7, 8, 9, 10].map((id) => ({ id })), nextCursor: 'second', total: 12 };
        }
        return { items: [10, 11, 12].map((id) => ({ id })), nextCursor: null, total: 12 };
      },
    });
    list.id = 'server-progressive-test';
    document.body.replaceChildren(list);
  });

  const list = page.locator('#server-progressive-test');
  await list.getByRole('button', { name: 'Show 5 more' }).click();
  await expect(list.locator('[data-progressive-identity]')).toHaveCount(5);
  await expect(list.getByRole('status')).toContainText('Existing results are unchanged');

  await list.getByRole('button', { name: 'Retry' }).click();
  await expect(list.locator('[data-progressive-identity]')).toHaveCount(10);
  await expect(page.locator(':focus')).toHaveAttribute('data-progressive-identity', '6');

  await list.getByRole('button', { name: 'Show 2 more' }).click();
  await expect(list.locator('[data-progressive-identity]')).toHaveCount(12);
  await expect(page.locator('body')).toHaveAttribute('data-calls', '3');

  await list.getByRole('button', { name: 'Show less' }).click();
  await expect(list.locator('[data-progressive-identity]')).toHaveCount(5);
  await list.getByRole('button', { name: 'Show 5 more' }).click();
  await expect(list.locator('[data-progressive-identity]')).toHaveCount(10);
  await expect(page.locator('body')).toHaveAttribute('data-calls', '3');
});
