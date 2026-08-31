PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS dashboard_settings (
  github_user_id INTEGER PRIMARY KEY REFERENCES dashboard_users(github_user_id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  default_window TEXT NOT NULL CHECK (default_window IN ('24h', '7d', '30d')),
  preview_size INTEGER NOT NULL CHECK (preview_size IN (5, 10, 15)),
  density TEXT NOT NULL CHECK (density IN ('COMFORTABLE', 'COMPACT')),
  collapse_secondary_sections INTEGER NOT NULL CHECK (collapse_secondary_sections IN (0, 1)),
  default_repository_id INTEGER REFERENCES repositories(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS dashboard_settings_default_repository
  ON dashboard_settings(default_repository_id);
