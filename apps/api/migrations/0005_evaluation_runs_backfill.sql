PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO evaluation_runs (
  id,
  idempotency_key,
  repository_id,
  installation_id,
  pull_request_number,
  head_sha,
  base_sha,
  check_run_id,
  source_event,
  source_action,
  source_delivery_id,
  observation_source,
  schema_version,
  evaluator_version,
  evaluated_at,
  attention,
  evidence_health,
  normalized_json,
  truncated
)
SELECT
  'backfill:' || e.repository_id || ':' || e.head_sha,
  'backfill:' || e.repository_id || ':' || e.head_sha,
  e.repository_id,
  e.installation_id,
  e.pull_request_number,
  e.head_sha,
  d.base_sha,
  e.check_run_id,
  'backfill',
  'retained-state',
  NULL,
  'BACKFILL',
  d.schema_version,
  d.evaluator_version,
  COALESCE(d.evaluated_at, e.updated_at),
  e.attention,
  CASE
    WHEN d.normalized_json IS NULL THEN 'UNKNOWN'
    WHEN EXISTS (
      SELECT 1 FROM json_each(d.normalized_json, '$.evaluation.evidence') item
      WHERE json_extract(item.value, '$.status') = 'FAILED'
    ) THEN 'FAILED'
    WHEN EXISTS (
      SELECT 1 FROM json_each(d.normalized_json, '$.evaluation.evidence') item
      WHERE json_extract(item.value, '$.status') IN ('PENDING', 'MISSING')
    ) THEN 'PENDING_OR_MISSING'
    WHEN EXISTS (
      SELECT 1 FROM json_each(d.normalized_json, '$.evaluation.evidence') item
    ) AND NOT EXISTS (
      SELECT 1 FROM json_each(d.normalized_json, '$.evaluation.evidence') item
      WHERE json_extract(item.value, '$.status') != 'UNKNOWN'
    ) THEN 'UNKNOWN'
    ELSE 'CLEAR'
  END,
  d.normalized_json,
  COALESCE(d.truncated, 0)
FROM evaluations e
LEFT JOIN evaluation_details d
  ON d.repository_id = e.repository_id
 AND d.head_sha = e.head_sha;
