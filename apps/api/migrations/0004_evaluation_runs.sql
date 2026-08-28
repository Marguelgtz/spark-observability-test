PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS evaluation_runs (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  installation_id INTEGER NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  pull_request_number INTEGER NOT NULL,
  head_sha TEXT NOT NULL,
  base_sha TEXT,
  check_run_id INTEGER NOT NULL,
  source_event TEXT NOT NULL,
  source_action TEXT NOT NULL,
  source_delivery_id TEXT,
  observation_source TEXT NOT NULL CHECK (observation_source IN ('LIVE', 'BACKFILL')),
  schema_version INTEGER,
  evaluator_version TEXT,
  evaluated_at TEXT NOT NULL,
  attention TEXT NOT NULL CHECK (attention IN ('LOW', 'MEDIUM', 'HIGH')),
  evidence_health TEXT NOT NULL CHECK (evidence_health IN ('CLEAR', 'FAILED', 'PENDING_OR_MISSING', 'UNKNOWN')),
  normalized_json TEXT,
  truncated INTEGER NOT NULL DEFAULT 0 CHECK (truncated IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS evaluation_runs_pr_time
  ON evaluation_runs(repository_id, pull_request_number, evaluated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS evaluation_runs_sha_time
  ON evaluation_runs(repository_id, head_sha, evaluated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS evaluation_runs_attention_time
  ON evaluation_runs(repository_id, attention, evaluated_at DESC);
