PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS dashboard_users (
  github_user_id INTEGER PRIMARY KEY,
  login TEXT NOT NULL,
  avatar_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dashboard_sessions (
  session_hash TEXT PRIMARY KEY,
  github_user_id INTEGER NOT NULL REFERENCES dashboard_users(github_user_id) ON DELETE CASCADE,
  repository_ids_json TEXT NOT NULL,
  installation_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS dashboard_sessions_user_id
  ON dashboard_sessions(github_user_id);

CREATE INDEX IF NOT EXISTS dashboard_sessions_expires_at
  ON dashboard_sessions(expires_at);
