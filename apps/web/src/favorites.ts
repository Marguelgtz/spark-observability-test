import type { DashboardFavoriteV1 } from '@spark/dashboard-contracts';

export type FavoriteTarget = DashboardFavoriteV1;

export interface FavoritePersistence {
  add(favorite: FavoriteTarget): Promise<void>;
  remove(favorite: FavoriteTarget): Promise<void>;
}

function targetKey(target: FavoriteTarget): string {
  if (target.kind === 'pull-request') {
    return `pr:${target.repositoryId}:${target.pullRequestNumber}`;
  }
  const observation = target.runId ? `run:${target.runId}` : `sha:${target.headSha}`;
  return `evaluation:${target.repositoryId}:${target.pullRequestNumber}:${observation}`;
}

function evaluationPrefix(repositoryId: number, pullRequestNumber: number): string {
  return `evaluation:${repositoryId}:${pullRequestNumber}:`;
}

export class FavoriteStore {
  private readonly favorites = new Map<string, FavoriteTarget>();

  constructor(initial: FavoriteTarget[], private readonly persistence: FavoritePersistence) {
    for (const favorite of initial) this.favorites.set(targetKey(favorite), favorite);
  }

  isFavorite(target: FavoriteTarget): boolean {
    return this.favorites.has(targetKey(target));
  }

  hasFavoriteForPullRequest(repositoryId: number, pullRequestNumber: number): boolean {
    if (this.isFavorite({ kind: 'pull-request', repositoryId, pullRequestNumber })) return true;
    const prefix = evaluationPrefix(repositoryId, pullRequestNumber);
    return [...this.favorites.keys()].some((item) => item.startsWith(prefix));
  }

  async toggle(target: FavoriteTarget): Promise<boolean> {
    const key = targetKey(target);
    const next = !this.favorites.has(key);
    if (next) await this.persistence.add(target);
    else await this.persistence.remove(target);
    if (next) this.favorites.set(key, target);
    else this.favorites.delete(key);
    return next;
  }
}
