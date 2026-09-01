# CI-501–503 — Bounded verification graph and inspection

Status: **ACCEPTED AS A DERIVED SHADOW PROJECTION** (2026-09-01)

## Boundary

The verification graph is an in-memory projection of normalized `RepositoryUnderstanding`. It is not persisted, independently mutated, or treated as another source of truth. Every node retains a canonical observation or claim ID, and claim-derived edges retain the responsible membership, boundary, expectation, or attribution ID.

The projection connects:

- change → changed artifact → repository-supported area/boundary;
- area → relationship → area;
- target → evidence expectation → matching runtime job;
- workflow definition → run → attempt → job → step → process result;
- attributed target → exact-revision evidence result; and
- supported unmatched expectation → `NOT_OBSERVED` result.

An unsupported expectation remains `UNKNOWN`, even when similarly named evidence exists. An unmatched supported expectation becomes `NOT_OBSERVED` only when exact-revision evidence acquisition is complete. Prior-revision evidence is absent from the current graph but remains in the canonical model.

## Bounds

Default graph limits:

| Collection | Limit |
| --- | ---: |
| Nodes | 500 |
| Edges | 1,000 |
| Inspection items per collection | 200 |
| Support entries per claim | 20 |
| Evidence references per support entry | 20 |

Every exceeded bound produces a `{ collection, observedCount, retainedCount }` record. Edges whose endpoints were truncated are omitted and counted in the edge truncation. Graph completeness becomes `PARTIAL` when a bound is reached or canonical normalization repaired invalid input.

## Developer inspection

`inspectVerificationGraph` returns a versioned, bounded record containing:

- the derived nodes and relationships;
- summaries of snapshot, change, artifact, pipeline, and evidence observations;
- areas, memberships, area relationships, boundaries, attributions, expectations, and claim support;
- provenance, derivation, confidence, evidence references, and completeness; and
- explicit graph and inspection truncation.

The inspection format does not contain raw CI logs, environment values, artifact bodies, or a product-facing UI contract. `serializeVerificationGraphInspection` emits stable formatted JSON for review and fixtures.

## Determinism

Canonical normalization runs before projection. Node identity is `node kind + canonical ID`; edge identity is `edge kind + endpoints + optional claim ID`. Node kinds have a fixed priority, and nodes, edges, observations, claims, supports, evidence references, completeness, and truncation records have deterministic ordering. Reordering equivalent input arrays does not change serialized output.

## Retained limitations

- Runtime matrix coordinates remain unavailable under CI-306; the graph preserves distinct provider jobs without inventing coordinates.
- The graph explains available supported claims but does not infer new coverage, failure domains, flakiness, or remediation.
- Point-in-time persistence/replay, live ingestion, attention policy, frontend behavior, and agent steering remain outside this gate.
