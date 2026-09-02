import type {
  DashboardDensityV1,
  DashboardSettingsInputV1,
  DashboardSettingsV1,
  PreviewSize,
} from '@spark/dashboard-contracts';
import { DASHBOARD_SETTINGS_DEFAULTS } from '@spark/dashboard-contracts';
import type { D1Database } from './d1';

interface SettingsRow {
  revision: number;
  defaultWindow: DashboardSettingsV1['defaultWindow'];
  previewSize: PreviewSize;
  density: DashboardDensityV1;
  collapseSecondarySections: number;
  defaultRepositoryId: number | null;
  updatedAt: string;
}

export interface DashboardSettingsStore {
  get(githubUserId: number): Promise<DashboardSettingsV1 | undefined>;
  replace(
    githubUserId: number,
    expectedRevision: number,
    settings: DashboardSettingsInputV1,
  ): Promise<DashboardSettingsV1 | undefined>;
}

export function defaultDashboardSettings(): DashboardSettingsV1 {
  return {
    version: 1,
    revision: 0,
    ...DASHBOARD_SETTINGS_DEFAULTS,
    updatedAt: null,
  };
}

function fromRow(row: SettingsRow): DashboardSettingsV1 {
  return {
    version: 1,
    revision: Number(row.revision),
    defaultWindow: row.defaultWindow,
    previewSize: Number(row.previewSize) as PreviewSize,
    density: row.density,
    collapseSecondarySections: row.collapseSecondarySections === 1,
    defaultRepositoryId: row.defaultRepositoryId === null ? null : Number(row.defaultRepositoryId),
    updatedAt: row.updatedAt,
  };
}

const RETURNING_SETTINGS = `revision,
  default_window AS defaultWindow,
  preview_size AS previewSize,
  density,
  collapse_secondary_sections AS collapseSecondarySections,
  default_repository_id AS defaultRepositoryId,
  strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) AS updatedAt`;

export class D1DashboardSettingsStore implements DashboardSettingsStore {
  constructor(private readonly db: D1Database) {}

  async get(githubUserId: number): Promise<DashboardSettingsV1 | undefined> {
    const row = await this.db.prepare(
      `SELECT ${RETURNING_SETTINGS}
       FROM dashboard_settings
       WHERE github_user_id = ?`,
    ).bind(githubUserId).first<SettingsRow>();
    return row ? fromRow(row) : undefined;
  }

  async replace(
    githubUserId: number,
    expectedRevision: number,
    settings: DashboardSettingsInputV1,
  ): Promise<DashboardSettingsV1 | undefined> {
    const commonBindings = [
      settings.defaultWindow,
      settings.previewSize,
      settings.density,
      settings.collapseSecondarySections ? 1 : 0,
      settings.defaultRepositoryId,
    ];

    const row = expectedRevision === 0
      ? await this.db.prepare(
        `INSERT INTO dashboard_settings
         (github_user_id, revision, default_window, preview_size, density,
          collapse_secondary_sections, default_repository_id)
         VALUES (?, 1, ?, ?, ?, ?, ?)
         ON CONFLICT(github_user_id) DO NOTHING
         RETURNING ${RETURNING_SETTINGS}`,
      ).bind(githubUserId, ...commonBindings).first<SettingsRow>()
      : await this.db.prepare(
        `UPDATE dashboard_settings
         SET revision = revision + 1,
             default_window = ?,
             preview_size = ?,
             density = ?,
             collapse_secondary_sections = ?,
             default_repository_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE github_user_id = ? AND revision = ?
         RETURNING ${RETURNING_SETTINGS}`,
      ).bind(...commonBindings, githubUserId, expectedRevision).first<SettingsRow>();

    return row ? fromRow(row) : undefined;
  }
}
