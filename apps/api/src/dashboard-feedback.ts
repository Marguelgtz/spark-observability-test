import type {
  SaveTrajectoryFeedbackV1,
  TrajectoryFeedbackClassificationV1,
  TrajectoryFeedbackV1,
} from '@spark/dashboard-contracts';
import type { D1Database } from './d1';

interface FeedbackRow {
  transitionId: string;
  classification: TrajectoryFeedbackClassificationV1;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardFeedbackStore {
  list(githubUserId: number, repositoryId: number, pullRequestNumber: number): Promise<TrajectoryFeedbackV1[]>;
  save(
    githubUserId: number,
    repositoryId: number,
    pullRequestNumber: number,
    transitionId: string,
    input: SaveTrajectoryFeedbackV1,
  ): Promise<TrajectoryFeedbackV1>;
}

function feedbackFromRow(row: FeedbackRow): TrajectoryFeedbackV1 {
  return {
    transitionId: row.transitionId,
    classification: row.classification,
    ...(row.note ? { note: row.note } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class D1DashboardFeedbackStore implements DashboardFeedbackStore {
  constructor(private readonly db: D1Database) {}

  async list(githubUserId: number, repositoryId: number, pullRequestNumber: number): Promise<TrajectoryFeedbackV1[]> {
    const rows = await this.db.prepare(
      `SELECT transition_id AS transitionId, classification, note,
              strftime('%Y-%m-%dT%H:%M:%fZ', created_at) AS createdAt,
              strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) AS updatedAt
       FROM trajectory_feedback
       WHERE github_user_id = ? AND repository_id = ? AND pull_request_number = ?
       ORDER BY updated_at DESC, transition_id ASC`,
    ).bind(githubUserId, repositoryId, pullRequestNumber).all<FeedbackRow>();
    return (rows.results ?? []).map(feedbackFromRow);
  }

  async save(
    githubUserId: number,
    repositoryId: number,
    pullRequestNumber: number,
    transitionId: string,
    input: SaveTrajectoryFeedbackV1,
  ): Promise<TrajectoryFeedbackV1> {
    await this.db.prepare(
      `INSERT INTO trajectory_feedback
       (github_user_id, repository_id, pull_request_number, transition_id, classification, note)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(github_user_id, repository_id, pull_request_number, transition_id) DO UPDATE SET
         classification = excluded.classification,
         note = excluded.note,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(
      githubUserId,
      repositoryId,
      pullRequestNumber,
      transitionId,
      input.classification,
      input.note ?? null,
    ).run();
    const saved = await this.db.prepare(
      `SELECT transition_id AS transitionId, classification, note,
              strftime('%Y-%m-%dT%H:%M:%fZ', created_at) AS createdAt,
              strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) AS updatedAt
       FROM trajectory_feedback
       WHERE github_user_id = ? AND repository_id = ? AND pull_request_number = ? AND transition_id = ?`,
    ).bind(githubUserId, repositoryId, pullRequestNumber, transitionId).first<FeedbackRow>();
    if (!saved) throw new Error('Trajectory feedback was not persisted');
    return feedbackFromRow(saved);
  }
}
