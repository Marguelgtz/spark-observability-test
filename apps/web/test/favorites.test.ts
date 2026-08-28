import { describe, expect, it } from 'vitest';
import { FavoriteStore, type FavoriteTarget } from '../src/favorites';

const pullRequest: FavoriteTarget = { kind: 'pull-request', repositoryId: 101, pullRequestNumber: 42 };
const firstRun: FavoriteTarget = { kind: 'evaluation', repositoryId: 101, pullRequestNumber: 42, runId: 'run-1', headSha: 'same-sha' };
const secondRun: FavoriteTarget = { kind: 'evaluation', repositoryId: 101, pullRequestNumber: 42, runId: 'run-2', headSha: 'same-sha' };

describe('favorites', () => {
  it('persists pull request and immutable run favorites independently', async () => {
    const saved: FavoriteTarget[] = [];
    const persistence = {
      add: async (favorite: FavoriteTarget) => { saved.push(favorite); },
      remove: async (favorite: FavoriteTarget) => {
        const index = saved.findIndex((item) => JSON.stringify(item) === JSON.stringify(favorite));
        if (index >= 0) saved.splice(index, 1);
      },
    };
    const favorites = new FavoriteStore([], persistence);

    await expect(favorites.toggle(firstRun)).resolves.toBe(true);
    expect(favorites.isFavorite(firstRun)).toBe(true);
    expect(favorites.isFavorite(secondRun)).toBe(false);
    expect(favorites.hasFavoriteForPullRequest(101, 42)).toBe(true);

    const reloaded = new FavoriteStore(saved, persistence);
    expect(reloaded.isFavorite(firstRun)).toBe(true);
    await expect(reloaded.toggle(pullRequest)).resolves.toBe(true);
    await expect(reloaded.toggle(firstRun)).resolves.toBe(false);
    expect(reloaded.hasFavoriteForPullRequest(101, 42)).toBe(true);
  });

  it('does not update local state when persistence fails', async () => {
    const favorites = new FavoriteStore([], {
      add: async () => { throw new Error('offline'); },
      remove: async () => undefined,
    });

    await expect(favorites.toggle(pullRequest)).rejects.toThrow('offline');
    expect(favorites.isFavorite(pullRequest)).toBe(false);
  });
});
