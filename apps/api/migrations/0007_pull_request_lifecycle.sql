PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pull_request_lifecycle (
  repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  installation_id INTEGER NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  pull_request_number INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('OPEN', 'CLOSED', 'MERGED')),
  opened_at TEXT,
  closed_at TEXT,
  merged_at TEXT,
  merge_sha TEXT,
  pre_merge_run_id TEXT REFERENCES evaluation_runs(id) ON DELETE SET NULL,
  pre_merge_attention TEXT CHECK (pre_merge_attention IN ('LOW', 'MEDIUM', 'HIGH')),
  pre_merge_evidence_health TEXT CHECK (pre_merge_evidence_health IN ('CLEAR', 'FAILED', 'PENDING_OR_MISSING', 'UNKNOWN')),
  unresolved_at_merge INTEGER CHECK (unresolved_at_merge IN (0, 1)),
  last_event_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (repository_id, pull_request_number)
);

CREATE INDEX IF NOT EXISTS pull_request_lifecycle_state_time
  ON pull_request_lifecycle(repository_id, state, merged_at DESC);

CREATE INDEX IF NOT EXISTS pull_request_lifecycle_pre_merge_run
  ON pull_request_lifecycle(pre_merge_run_id);
