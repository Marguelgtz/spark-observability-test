PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS changes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('SINGLETON', 'GROUP')),
  title TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by_github_user_id INTEGER REFERENCES dashboard_users(github_user_id) ON DELETE SET NULL,
  updated_by_github_user_id INTEGER REFERENCES dashboard_users(github_user_id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((kind = 'SINGLETON' AND title IS NULL) OR (kind = 'GROUP' AND length(trim(title)) > 0))
);

CREATE TABLE IF NOT EXISTS change_aliases (
  alias_id TEXT PRIMARY KEY,
  canonical_change_id TEXT NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (alias_id != canonical_change_id)
);

CREATE TABLE IF NOT EXISTS change_members (
  change_id TEXT NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
  repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  pull_request_number INTEGER NOT NULL CHECK (pull_request_number > 0),
  position INTEGER NOT NULL CHECK (position >= 0),
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (change_id, repository_id, pull_request_number),
  UNIQUE (repository_id, pull_request_number),
  UNIQUE (change_id, position)
);

CREATE INDEX IF NOT EXISTS change_members_change_position
  ON change_members(change_id, position);

CREATE TRIGGER IF NOT EXISTS change_members_delete_orphan
AFTER DELETE ON change_members
WHEN NOT EXISTS (SELECT 1 FROM change_members WHERE change_id = OLD.change_id)
BEGIN
  DELETE FROM changes WHERE id = OLD.change_id;
END;