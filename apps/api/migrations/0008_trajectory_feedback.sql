PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS trajectory_feedback (
  github_user_id INTEGER NOT NULL REFERENCES dashboard_users(github_user_id) ON DELETE CASCADE,
  repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  pull_request_number INTEGER NOT NULL,
  transition_id TEXT NOT NULL CHECK (length(transition_id) BETWEEN 1 AND 1024),
  classification TEXT NOT NULL CHECK (
    classification IN ('USEFUL', 'EXPECTED', 'FALSE_POSITIVE', 'FIXED_BECAUSE_SPARK')
  ),
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (github_user_id, repository_id, pull_request_number, transition_id)
);

CREATE INDEX IF NOT EXISTS trajectory_feedback_repository_pr
  ON trajectory_feedback(repository_id, pull_request_number, updated_at DESC);

CREATE INDEX IF NOT EXISTS trajectory_feedback_user_updated
  ON trajectory_feedback(github_user_id, updated_at DESC);
