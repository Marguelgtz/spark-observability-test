PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS dashboard_favorites (
  github_user_id INTEGER NOT NULL REFERENCES dashboard_users(github_user_id) ON DELETE CASCADE,
  favorite_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('PULL_REQUEST', 'EVALUATION_RUN', 'EVALUATION_SHA')),
  repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  pull_request_number INTEGER NOT NULL,
  run_id TEXT REFERENCES evaluation_runs(id) ON DELETE CASCADE,
  head_sha TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (github_user_id, favorite_key),
  CHECK (
    (kind = 'PULL_REQUEST' AND run_id IS NULL AND head_sha IS NULL)
    OR (kind = 'EVALUATION_RUN' AND run_id IS NOT NULL AND head_sha IS NOT NULL)
    OR (kind = 'EVALUATION_SHA' AND run_id IS NULL AND head_sha IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS dashboard_favorites_user_created
  ON dashboard_favorites(github_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS dashboard_favorites_repository
  ON dashboard_favorites(repository_id, pull_request_number);
