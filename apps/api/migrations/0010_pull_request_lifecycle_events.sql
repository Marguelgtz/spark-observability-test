PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pull_request_lifecycle_events (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  pull_request_number INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('OPENED', 'REOPENED', 'CLOSED', 'MERGED')),
  occurred_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('LIVE', 'BACKFILL')),
  head_sha TEXT,
  merge_sha TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS pull_request_lifecycle_events_pr_time
  ON pull_request_lifecycle_events(repository_id, pull_request_number, occurred_at, id);