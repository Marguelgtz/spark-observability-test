# CI-601 — CI/CD process persistence boundary decision

Status: **ACCEPTED** (2026-09-01)

## Question

What must Spark durably retain so that, for a repository revision and a past time, it can truthfully reconstruct *what had executed, what was running, what was expected, what was missing, and what Spark believed* — without duplicating the canonical domain model, without retaining unbounded or sensitive provider data, and without a second store?

## Decision

Persist **one bounded record per observation event**, where the payload is the **normalized `RepositoryUnderstanding`** produced by the existing G1–G5 seam. Everything else — legacy projections, the verification graph, and later deterministic insights — is **re-derived on demand**, never stored as a second source of truth.

The record is a store-agnostic envelope defined in `packages/core` (`ProcessObservationRecord`):

```text
recordId            stable logical identity (idempotency key)
repositoryId        exact repository identity
revision            exact head SHA the observation evaluated
source              LIVE | BACKFILL
providerEventAt     provider event time (delivery/trigger time)
observedAt          Spark observation/evaluation time
ingestedAt          durable storage time (== observedAt on the live path)
modelVersions       understanding-model, normalization, adapter/evaluator versions
understanding       normalized, bounded RepositoryUnderstanding payload
truncation          explicit bounded-payload truncation record
```

### Retained (canonical)

- Process facts: pipeline definitions, runs, attempts, jobs, steps — provider-stable IDs, exact revision, lifecycle, outcome, provider timestamps, URLs, self-hosted classification only.
- Evidence run observations with coherent process ancestry (enforced by normalization).
- Claims: evidence attributions, evidence expectations, completeness assessments — with full provenance, derivation, confidence, and support.
- Areas, memberships, relationships, boundaries and their support.
- Source completeness per acquisition dimension: acquisition truth stays with the record so absence is never over-read later.
- Exact `revision` + `baseRevision` and the model/normalization/adapter versions that produced the payload.

### External / on-demand (never in the default record)

- Raw CI logs (provider URLs retained; logs fetched lazily during investigation).
- Workflow file bytes (re-fetchable at the evaluated SHA; identity via workflow/run IDs).
- Artifact contents, cache contents, artifact binaries.
- Runner machine names/IDs (classification only, already the G2 rule).
- Secret values, environment variable values, deep action inputs, arbitrary action contexts.
- Large external provider payloads beyond the bounded run/job/step metadata.

## Versioning and readability

Every record carries the understanding-model version, normalization version, and adapter/evaluator versions. Records of older versions remain readable; a reader that meets an unknown newer version retains the raw payload and reports the record as `unreadable` rather than misinterpreting it. This is the CI/CD realization of RU-506 (bounded claim persistence decision) and supplies the storage shape RU-602 (versioned normalized storage) needs when the understanding path becomes canonical under RU-601. One store, one envelope, no parallel process database.

## Time axes (CI-602)

Three distinct axes are first-class on the record:

1. `providerEventAt` — when the provider event happened (webhook delivery time; provider run timestamps remain inside the observation facts themselves).
2. `observedAt` — when Spark acquired and evaluated the observation.
3. `ingestedAt` — when the record was durably stored.

Enforced ordering: `providerEventAt <= observedAt <= ingestedAt`. On the live path `observedAt == ingestedAt` within one processing step; a backfill has an old `providerEventAt`, a recent `observedAt`, and `source: BACKFILL` marks that the gap is intentional.

## Idempotency (CI-603)

- Delivery level: existing `webhook_deliveries` claim/release dedups provider delivery retries.
- Record level: `recordId` is the stable logical identity. LIVE records key off the delivery identity; BACKFILL records key off a stable backfill namespace (`backfill:{repository}:{revision}`). Re-ingesting a record with an identity already present is a no-op replacement candidate: the deterministic deduplication keeps one record per identity and reports the duplicate.
- Fact level: provider-stable execution identities (run ID, attempt number, job ID, step sequence) plus `uniqueById` normalization mean the same logical execution never appears twice inside a payload.
- A webhook retry therefore creates zero new logical executions at any layer.

## Historical reconstruction (CI-604)

For `(repository, revision, time T)`:

- Candidate records: same repository and exact revision with `observedAt <= T`.
- The **latest** candidate (deterministic tie-break) is the primary state: its lifecycle facts, claims, and source completeness describe what Spark knew most recently by T.
- **Terminal monotonicity:** an execution (run/attempt/job/step/evidence run) that is `COMPLETED` or `CANCELLED` in any candidate record remains terminal in the reconstruction; a completed execution cannot become un-completed. Non-terminal executions take their state from the latest record.
- **Sticky knowledge:** executions present in an older `COMPLETE` acquisition but absent from a newer `PARTIAL` one keep their older terminal facts — Spark still knows them.
- Absence remains absence only when bounded by acquisition completeness; partial acquisition yields `UNKNOWN`, never absence.
- Reconstruction reports: the supplying record, the observation gap before it, and how many later observations for the revision exist after T (information the reconstruction deliberately does not use). It reconstructs **what Spark knew**, not what was true.

Per-revision isolation is inherited: revision A's records never inform revision B's state (CI-003 invariant).

## Export (CI-605)

V0 export is bounded JSONL: a manifest line plus one canonical-serialized record line, deterministic key/order, bounded record count, and explicit truncation records. Parquet/DuckDB/analytical consumers read the JSONL; no Spark-owned columnar format is introduced.

## What this does not change

- The live `SparkInput`/`SparkEvaluation` ingestion path, `evaluation_runs`/`evaluation_details` D1 tables, attention policy, or the neutral GitHub Check.
- The process path remains shadow/derived; live persistence of process records happens only when the understanding path is adopted (RU-601/602), reusing this exact envelope.
- No frontend, agent, or ML capability.

## Retained limitations

- Reconstruction is only as current as the last retained observation; provider state that changed without a new observation is not reconstructable.
- D1 capacity for whole-understanding payloads is bounded but real; per-record payload bounds and record-count retention policies are deployment concerns recorded at adoption time, not core semantics.
- Cross-repository or cross-provider correlation of the same logical verification is out of scope.