PRAGMA foreign_keys = ON;

-- Adds per-repository dashboard access grants (JSON) to existing sessions.
ALTER TABLE dashboard_sessions ADD COLUMN repository_permissions_json TEXT;