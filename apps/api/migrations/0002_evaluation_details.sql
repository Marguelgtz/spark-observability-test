PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS evaluation_details (
  repository_id INTEGER NOT NULL,
  head_sha TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  base_sha TEXT NOT NULL,
  pull_request_title TEXT NOT NULL,
  pull_request_url TEXT NOT NULL,
  evaluator_version TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  check_url TEXT,
  normalized_json TEXT NOT NULL,
  truncated INTEGER NOT NULL DEFAULT 0 CHECK (truncated IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (repository_id, head_sha),
  FOREIGN KEY (repository_id, head_sha)
    REFERENCES evaluations(repository_id, head_sha)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS evaluation_details_evaluated_at
  ON evaluation_details(evaluated_at DESC);
