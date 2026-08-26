PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS installations (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL,
  account_login TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS repositories (
  id INTEGER PRIMARY KEY,
  installation_id INTEGER NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS repositories_installation_id ON repositories(installation_id);

CREATE TABLE IF NOT EXISTS evaluations (
  repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  head_sha TEXT NOT NULL,
  installation_id INTEGER NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  pull_request_number INTEGER NOT NULL,
  check_run_id INTEGER NOT NULL,
  attention TEXT NOT NULL CHECK (attention IN ('LOW', 'MEDIUM', 'HIGH')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (repository_id, head_sha)
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  delivery_id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
