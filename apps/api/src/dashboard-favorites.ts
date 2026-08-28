import type { DashboardFavoriteV1, FavoritesResponseV1 } from '@spark/dashboard-contracts';
import type { D1Database } from './d1';

interface FavoriteRow {
  kind: 'PULL_REQUEST' | 'EVALUATION_RUN' | 'EVALUATION_SHA';
  repositoryId: number;
  pullRequestNumber: number;
  runId: string | null;
  headSha: string | null;
}

export interface DashboardFavoriteStore {
  list(githubUserId: number, repositoryIds: number[]): Promise<FavoritesResponseV1>;
  add(githubUserId: number, favorite: DashboardFavoriteV1): Promise<boolean>;
  remove(githubUserId: number, favorite: DashboardFavoriteV1): Promise<void>;
}

export function favoriteKey(favorite: DashboardFavoriteV1): string {
  if (favorite.kind === 'pull-request') {
    return `pr:${favorite.repositoryId}:${favorite.pullRequestNumber}`;
  }
  return favorite.runId
    ? `run:${favorite.repositoryId}:${favorite.runId}`
    : `sha:${favorite.repositoryId}:${favorite.headSha}`;
}

export class D1DashboardFavoriteStore implements DashboardFavoriteStore {
  constructor(private readonly db: D1Database) {}

  async list(githubUserId: number, repositoryIds: number[]): Promise<FavoritesResponseV1> {
    if (!repositoryIds.length) return { version: 1, favorites: [] };
    const rows = await this.db.prepare(
      `SELECT kind, repository_id AS repositoryId, pull_request_number AS pullRequestNumber,
              run_id AS runId, head_sha AS headSha
       FROM dashboard_favorites
       WHERE github_user_id = ?
         AND repository_id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))
       ORDER BY created_at DESC, favorite_key ASC`,
    ).bind(githubUserId, JSON.stringify(repositoryIds)).all<FavoriteRow>();
    return {
      version: 1,
      favorites: (rows.results ?? []).flatMap((row): DashboardFavoriteV1[] => {
        if (row.kind === 'PULL_REQUEST') {
          return [{ kind: 'pull-request', repositoryId: row.repositoryId, pullRequestNumber: row.pullRequestNumber }];
        }
        if (!row.headSha) return [];
        return [{
          kind: 'evaluation',
          repositoryId: row.repositoryId,
          pullRequestNumber: row.pullRequestNumber,
          ...(row.runId ? { runId: row.runId } : {}),
          headSha: row.headSha,
        }];
      }),
    };
  }

  async add(githubUserId: number, favorite: DashboardFavoriteV1): Promise<boolean> {
    const key = favoriteKey(favorite);
    if (favorite.kind === 'pull-request') {
      const result = await this.db.prepare(
        `INSERT OR IGNORE INTO dashboard_favorites
         (github_user_id, favorite_key, kind, repository_id, pull_request_number)
         SELECT ?, ?, 'PULL_REQUEST', ?, ?
         WHERE EXISTS (
           SELECT 1 FROM evaluation_runs WHERE repository_id = ? AND pull_request_number = ?
           UNION ALL
           SELECT 1 FROM evaluations WHERE repository_id = ? AND pull_request_number = ?
         )`,
      ).bind(
        githubUserId, key, favorite.repositoryId, favorite.pullRequestNumber,
        favorite.repositoryId, favorite.pullRequestNumber,
        favorite.repositoryId, favorite.pullRequestNumber,
      ).run();
      return (result.meta?.changes ?? 0) > 0 || await this.exists(githubUserId, key);
    }

    if (favorite.runId) {
      const result = await this.db.prepare(
        `INSERT OR IGNORE INTO dashboard_favorites
         (github_user_id, favorite_key, kind, repository_id, pull_request_number, run_id, head_sha)
         SELECT ?, ?, 'EVALUATION_RUN', repository_id, pull_request_number, id, head_sha
         FROM evaluation_runs
         WHERE id = ? AND repository_id = ? AND pull_request_number = ? AND head_sha = ?`,
      ).bind(
        githubUserId, key, favorite.runId, favorite.repositoryId,
        favorite.pullRequestNumber, favorite.headSha,
      ).run();
      return (result.meta?.changes ?? 0) > 0 || await this.exists(githubUserId, key);
    }

    const result = await this.db.prepare(
      `INSERT OR IGNORE INTO dashboard_favorites
       (github_user_id, favorite_key, kind, repository_id, pull_request_number, head_sha)
       SELECT ?, ?, 'EVALUATION_SHA', repository_id, pull_request_number, head_sha
       FROM evaluations
       WHERE repository_id = ? AND pull_request_number = ? AND head_sha = ?`,
    ).bind(
      githubUserId, key, favorite.repositoryId, favorite.pullRequestNumber, favorite.headSha,
    ).run();
    return (result.meta?.changes ?? 0) > 0 || await this.exists(githubUserId, key);
  }

  async remove(githubUserId: number, favorite: DashboardFavoriteV1): Promise<void> {
    await this.db.prepare(
      'DELETE FROM dashboard_favorites WHERE github_user_id = ? AND favorite_key = ?',
    ).bind(githubUserId, favoriteKey(favorite)).run();
  }

  private async exists(githubUserId: number, key: string): Promise<boolean> {
    const row = await this.db.prepare(
      'SELECT 1 AS found FROM dashboard_favorites WHERE github_user_id = ? AND favorite_key = ?',
    ).bind(githubUserId, key).first<{ found: number }>();
    return row?.found === 1;
  }
}
