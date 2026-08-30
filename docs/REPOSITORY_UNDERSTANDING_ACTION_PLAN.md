# Repository Understanding Action Plan

Status: active living plan. No implementation task has started yet.

Research basis: [`REPOSITORY_UNDERSTANDING_RESEARCH.md`](./REPOSITORY_UNDERSTANDING_RESEARCH.md).

## Outcome

Cement Spark's repository-understanding foundation around observations and provenance-bearing claims while preserving current GitHub Check, persistence, CLI, dashboard, trajectory, and frontend representations through compatibility projections.

The implementation round is successful when:

- Spark produces useful structural understanding without a profile or ecosystem adapter.
- JS/TS workspace discovery contributes to the generic model rather than defining it.
- Stint changes resolve to meaningful structural areas without a Stint-specific core concept.
- Areas, memberships, relationships, boundaries, evidence runs, evidence attribution, and evidence expectations retain provenance and uncertainty.
- Existing product consumers continue to receive compatible evaluation fields until an explicit later migration.
- Profiles enrich repository-native understanding and are loaded from the pull request base revision.
- Structural uncertainty, missing evidence, and attention are separately representable.
- Corpus fixtures and shadow comparisons support any eventual cutover.

## Scope guardrails

- Keep the core provider-neutral and deterministic.
- Do not introduce a graph database, runtime LLM, or general plugin framework.
- Do not encode JavaScript, Go, Python, Rust, Bazel, Spark, or Stint concepts into core types.
- Do not redesign product surfaces. Permit only compatibility fixes or a bounded developer/debug representation.
- Do not retune attention before evidence attribution and understanding completeness can be inspected separately.
- Do not remove legacy fields until their consumers and historical trajectory behavior have migrated.
- Do not treat profile declarations as replacements for observed repository facts.

## How this plan stays dynamic

### Task statuses

- `BACKLOG`: accepted work, not yet eligible to start.
- `READY`: dependencies and acceptance evidence are defined.
- `IN PROGRESS`: the single current implementation task.
- `BLOCKED`: cannot progress; the blocker and attempted alternatives must be recorded.
- `DONE`: acceptance evidence has been inspected and linked in the task evidence log.
- `DROPPED`: intentionally removed, with the reason and superseding decision recorded.

### Update rules

1. Keep task IDs stable. Do not reuse an ID after completion or removal.
2. Add newly discovered work under the relevant gate using the next available ID.
3. Split a task when its acceptance evidence or rollback boundary becomes materially different; retain the original as a parent task.
4. Do not silently expand an in-progress task. Add a child task or record a decision.
5. Reordering is allowed when dependencies remain satisfied; record the reason in the change log.
6. Mark a task `DONE` only after its specified tests or inspection evidence pass.
7. Keep at most one task `IN PROGRESS` so the next action remains unambiguous.
8. At each gate, reconcile this plan against the research guardrails and current worktree before continuing.
9. Add follow-up tasks from shadow mismatches instead of weakening compatibility assertions to make a gate pass.
10. Completed task wording is historical record. Correct it through a note or superseding task rather than rewriting what was originally accepted.

## Change map

### Use

- Existing `Change` and `ChangedFile` concepts.
- Exact base/head revision identity and changed-file completeness.
- GitHub tree and selected-file retrieval.
- Check Run acquisition and provider status normalization.
- Pure deterministic core boundaries.
- Neutral GitHub Check publication.
- Current normalized evaluation retention and consumer contracts during compatibility mode.
- Existing JS workspace parsing algorithms as adapter internals.

### Add

- Repository, change, artifact, and evidence-run observations.
- Claim support with provenance source, derivation, categorical confidence, evidence references, and completeness.
- Areas, many-to-many memberships, typed relationships, and boundaries.
- Evidence attribution and evidence expectation claims.
- Analyzer contribution and orchestration interfaces.
- Per-source and per-dimension completeness.
- An explicit compatibility projector.
- Bounded shadow comparison and developer inspection output.

### Refactor

- JS workspace resolution into an ecosystem analyzer that emits claims.
- Generic path/sensitive-surface detection into structural and boundary claim contributors.
- Dependency traversal to use area IDs and typed relationships.
- GitHub input assembly into observation acquisition followed by analysis.
- Evidence normalization so Check Runs remain observations and coverage becomes a projection.
- `AnalysisCompleteness` into a compatibility summary of richer completeness assessments.

### Replace gradually

- `Project` as the canonical repository model; retain it temporarily as a compatibility projection.
- Names and paths as relationship identity; use area IDs internally.
- `KnowledgeClass` as the only epistemic metadata; replace internally with fact/claim separation and support dimensions.
- Direct mutation of attention from structural/evidence uncertainty; only after shadow validation.

### Defer

- Full artifact graph or graph database.
- Historical evaluation reprocessing.
- Rich frontend experiences for overlapping areas or evidence graphs.
- Automatic reconciliation of inferred and declared identities.
- Numeric confidence.
- Git-history inference, ownership analyzers, and additional ecosystem adapters beyond those required to validate the base.

## Delivery gates

| Gate | Exit condition | User-visible behavior |
| --- | --- | --- |
| G0 — Characterization | Current outputs and known uncertainty behavior are locked by fixtures. | No change. |
| G1 — Substrate and projection | Observation/claim types and compatibility projector reproduce current JS workspace evaluations. | No intended change. |
| G2 — Repository-native understanding | Generic analysis and refactored JS adapter emit claims; Stint no longer collapses wholly to `Repository root`. | Better structural explanation may be available in shadow/debug output; legacy check unchanged. |
| G3 — Evidence architecture | Runs, attribution, expectations, and completeness are distinct and project safely to legacy evidence. | No attention-policy change. |
| G4 — Profile enrichment | Base-revision profiles contribute declared claims and expected evidence without replacing generic claims. | Historical profile capability restored through compatibility output. |
| G5 — Corpus and shadow validation | Spark, Stint, and public/synthetic fixtures pass; mismatches are classified and resolved or explicitly accepted. | Existing surfaces remain compatible. |
| G6 — Controlled adoption | Canonical evaluator consumes the new model; legacy internals are removable behind versioned persistence and rollback. | Any attention change requires a separate approved task. |

## Task register

### G0 — Characterize current behavior

| ID | Status | Task | Depends on | Acceptance evidence |
| --- | --- | --- | --- | --- |
| RU-001 | DONE | Create characterization fixtures for current Spark evaluation behavior. | — | Fixtures cover localized workspace, downstream fan-out, generic root fallback, unmapped paths, sensitive paths, incomplete files, and unknown coverage without changing expected outputs. |
| RU-002 | READY | Add immutable Spark and Stint change fixtures from the research corpus. | RU-001 | Fixture provenance records commit/PR identity and contains only the metadata needed for deterministic tests. |
| RU-003 | BACKLOG | Catalogue every current consumer of `Project`, `directAreas`, `affectedAreas`, `sensitiveSurfaces`, evidence coverage, and analysis notes. | RU-001 | Consumer map covers core, GitHub Check, persistence, trajectory, contracts, CLI, and web with an owner migration state. |
| RU-004 | BACKLOG | Establish compatibility snapshot and ordering rules. | RU-001, RU-003 | Tests specify stable labels, ordering, deduplication, repository-wide markers, and trajectory set behavior. |

### G1 — Add the substrate and compatibility projector

| ID | Status | Task | Depends on | Acceptance evidence |
| --- | --- | --- | --- | --- |
| RU-101 | BACKLOG | Add provider-neutral observation types. | G0 | Types represent repository snapshot, change/artifact observations, evidence runs, and independent source completeness without semantic area conclusions. |
| RU-102 | BACKLOG | Add claim-support types. | RU-101 | Provenance, derivation, categorical confidence, evidence references, and completeness are independent and validated. |
| RU-103 | BACKLOG | Add Area, Membership, Relationship, Boundary, Attribution, and Expectation types. | RU-102 | Types support overlapping memberships, optional hierarchy, typed edges, boundaries without known connected areas, and claim support. |
| RU-104 | BACKLOG | Define model invariants and deterministic normalization. | RU-103 | Duplicate IDs, dangling references, unstable ordering, and invalid confidence/completeness states have deterministic outcomes and tests. |
| RU-105 | BACKLOG | Implement the compatibility projector. | RU-104 | Projects `Project[]`, direct/affected area strings, sensitive surfaces, legacy evidence coverage, and analysis completeness with documented loss. |
| RU-106 | BACKLOG | Prove projector parity for current JS workspace scenarios. | RU-105 | G0 fixtures pass through both current and projected paths with intentional differences recorded as new tasks. |

### G2 — Build repository-native analysis

| ID | Status | Task | Depends on | Acceptance evidence |
| --- | --- | --- | --- | --- |
| RU-201 | BACKLOG | Define the analyzer contribution and orchestration contract. | G1 | Multiple analyzers contribute claims independently; failures and truncation remain source-scoped; output ordering is deterministic. |
| RU-202 | BACKLOG | Resolve the conservative generic structural-region heuristic against corpus fixtures. | RU-201 | Written decision and tests show useful Spark/Stint/Django regions without treating every directory as an area or inventing project semantics. |
| RU-203 | BACKLOG | Implement the generic structural analyzer. | RU-202 | Zero-config changed paths map to supported structural areas with provenance; flat repositories remain useful without fabricated subdivisions. |
| RU-204 | BACKLOG | Convert the current JS workspace resolver into an adapter. | RU-201, RU-103 | Existing project units and dependencies become areas, memberships, and `depends_on` claims with manifest evidence references. |
| RU-205 | BACKLOG | Convert sensitive-path logic into boundary claims. | RU-201, RU-103 | CI, dependency, deployment, migration, and security detections no longer become canonical area identities; compatibility labels remain stable. |
| RU-206 | BACKLOG | Add source/dimension completeness aggregation. | RU-203, RU-204, RU-205 | Tree, file, analyzer, relationship, and boundary completeness remain independently inspectable and project to legacy notes. |
| RU-207 | BACKLOG | Validate generic understanding against Stint without loading its profile. | RU-203, RU-206 | `internal/provider/vast` and other changed regions are meaningful, provenance-bearing, and not represented solely as `Repository root`. |
| RU-208 | BACKLOG | Guard against manifest and generated/vendor false areas. | RU-203, RU-204 | Cargo fixture manifests do not manufacture projects; Kubernetes vendor/generated paths remain artifacts unless supported claims group them. |

### G3 — Separate evidence execution, attribution, and expectation

| ID | Status | Task | Depends on | Acceptance evidence |
| --- | --- | --- | --- | --- |
| RU-301 | BACKLOG | Refactor normalized Check Runs into EvidenceRun observations. | G1 | Provider identity, exact revision, lifecycle/result, URL, and duplicates are retained without embedded semantic coverage. |
| RU-302 | BACKLOG | Add checked-in workflow observation and bounded interpretation. | RU-201, RU-301 | Trigger filters, commands, matrices, and unresolved dynamic/external behavior have explicit completeness. |
| RU-303 | BACKLOG | Add evidence-attribution claims. | RU-302 | Attributions can target change, area, boundary, or relationship and state repository-supported versus adapter-derived support. |
| RU-304 | BACKLOG | Add evidence-expectation claims. | RU-303 | `MISSING` is produced only from a supported repository rule, required-check policy, adapter rule, or profile declaration. |
| RU-305 | BACKLOG | Project evidence claims into legacy `Evidence[]`. | RU-303, RU-304 | Existing consumers receive stable statuses and `UNKNOWN` coverage when adequate attribution does not exist. |
| RU-306 | BACKLOG | Validate workflow/evidence cases across Spark, Stint, Django, Cargo, Kubernetes, and Bazel fixtures. | RU-305 | Repository-defined scope is distinguished from external/unknown CI; passing checks never imply universal coverage. |

### G4 — Restore profiles as declared enrichment

| ID | Status | Task | Depends on | Acceptance evidence |
| --- | --- | --- | --- | --- |
| RU-401 | BACKLOG | Port and harden historical profile parsing and validation. | G2, G3 | Profile is loaded from the base revision; proposed head profile is validated separately; invalid/absent states retain notes. |
| RU-402 | BACKLOG | Convert profile areas into declared area and membership claims. | RU-401 | Stable IDs, disjoint paths, overlapping areas, owners, criticality, and provenance coexist with generic/adapter claims. |
| RU-403 | BACKLOG | Convert expected evidence into expectation claims. | RU-401, RU-304 | Expectations retain profile provenance and never fabricate EvidenceRun observations. |
| RU-404 | BACKLOG | Define bounded profile conflict behavior for compatibility mode. | RU-402 | Conflicting claims coexist; observed facts are never overwritten; compatibility selection is deterministic and documented. |
| RU-405 | BACKLOG | Restore Spark and Stint profile behavior through the projector. | RU-403, RU-404 | Historical profile scenarios pass using the new substrate, including owners, criticality, missing expectations, and proposed-profile validation. |

### G5 — Shadow validation and corpus gate

| ID | Status | Task | Depends on | Acceptance evidence |
| --- | --- | --- | --- | --- |
| RU-501 | BACKLOG | Add dual-path shadow evaluation in tests. | G4 | Current and new paths run on the same inputs; field-level differences are classified without changing Check output. |
| RU-502 | BACKLOG | Add bounded developer inspection serialization. | RU-501 | Claims, support, completeness, and projection rationale are reviewable with explicit truncation and no frontend redesign. |
| RU-503 | BACKLOG | Replay the complete research corpus. | RU-501, RU-502 | Spark, Stint, 16 public PR cases, and synthetic cases have recorded outcomes against every viability gate. |
| RU-504 | BACKLOG | Reconcile shadow mismatches. | RU-503 | Every mismatch is fixed, explicitly accepted, or converted into a new tracked task; fixtures are not weakened silently. |
| RU-505 | BACKLOG | Audit performance and GitHub API bounds. | RU-503 | Request counts, tree/file limits, analyzer bounds, large-repository behavior, and truncation reporting are verified. |
| RU-506 | BACKLOG | Decide whether bounded claim persistence is required for adoption. | RU-502, RU-505 | Decision records debugging, replay, privacy, size, and schema-version tradeoffs; implementation task is added only if justified. |

### G6 — Controlled adoption and cleanup

| ID | Status | Task | Depends on | Acceptance evidence |
| --- | --- | --- | --- | --- |
| RU-601 | BACKLOG | Make the new understanding path canonical behind the compatibility projector. | G5 | All existing contract and product tests pass; rollback to the prior evaluator remains possible. |
| RU-602 | BACKLOG | Version normalized evaluation storage for the canonical model boundary. | RU-601, RU-506 | Old evaluations remain readable and new records identify evaluator/schema versions and truncation. |
| RU-603 | BACKLOG | Separate understanding/evidence state from attention input. | RU-601 | Structural uncertainty and evidence uncertainty are independently available; existing attention remains unchanged initially. |
| RU-604 | BACKLOG | Propose attention-policy changes as a separate decision and task set. | RU-603 | Corpus deltas explain every proposed change; no score change is hidden inside repository-model migration. |
| RU-605 | BACKLOG | Remove obsolete canonical `Project` and embedded evidence-coverage paths. | RU-601, RU-602 | No current consumer reads the old canonical path; compatibility DTOs remain only where explicitly required. |
| RU-606 | BACKLOG | Close the implementation round with a requirement audit. | RU-605 | Outcome criteria, gates, tests, docs, and deferred work are verified against authoritative state. |

## Expansion backlog

These are intentionally outside the initial gates. Promote them into numbered tasks only when corpus or product evidence justifies them:

- Go module/package adapter.
- Cargo workspace adapter.
- Bazel target adapter.
- Python packaging/test-convention adapter.
- CODEOWNERS and Kubernetes-style OWNERS analyzer.
- Git/PR history and co-change analyzer.
- Generated-source relationship adapter.
- Required-check/ruleset integration.
- External CI adapters such as Prow or Buildkite.
- Area identity reconciliation across path moves.
- Historical evaluation reprocessing.
- Rich area/evidence frontend experiences.

## Stacked PR ledger

Each branch targets the branch immediately above it in the stack. Keep each PR below 25 commits; prefer 2–8 reviewable commits and split the branch when the scope or rollback boundary changes.

| Stack | Branch | Target | Scope | Tasks | PR | Commits | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S0 | `repository-understanding/0-research` | `dashboard/phase-6-graph-restoration` | Research, decisions, and living action plan | Planning foundation | [#49](https://github.com/Marguelgtz/spark-observability-test/pull/49) | 2 | Open |
| S1 | `repository-understanding/1-characterization` | `repository-understanding/0-research` | Current behavior characterization | RU-001–RU-004 | Pending | 2–6 planned | In progress |
| S2 | `repository-understanding/2-substrate` | `repository-understanding/1-characterization` | Observations, claims, invariants, and compatibility projector | RU-101–RU-106 | Pending | 4–10 planned | Planned |

Add later stack branches only when the preceding gate is sufficiently stable to define a reviewable target. If a planned branch approaches 20 commits or mixes independent rollback boundaries, split it before opening or updating the PR.

## Task evidence log

Add one row whenever a task changes status. Evidence must point to tests, commands, commits, artifacts, or decisions rather than restating intent.

| Date | Task | Transition | Evidence / reason |
| --- | --- | --- | --- |
| 2026-08-30 | Plan | created | Research conclusion `VIABLE WITH REVISIONS`; task register initialized with RU-001 ready and all implementation tasks unstarted. |
| 2026-08-30 | S0 | preparing -> open | Documentation foundation committed and opened as PR #49 against `dashboard/phase-6-graph-restoration`. |
| 2026-08-30 | RU-001 | ready -> in progress | S1 created from S0; characterization fixtures are the active implementation task. |
| 2026-08-30 | RU-001 | in progress -> done | Seven exact-output scenarios pass in `current-behavior.test.ts`; core tests report 28 passing tests and repository typecheck passes. |
| 2026-08-30 | RU-002 | backlog -> ready | RU-001 characterization baseline is committed and the corpus identities are already recorded in the research RFC. |

## Plan change log

| Date | Change | Reason |
| --- | --- | --- |
| 2026-08-30 | Initial six-gate action plan created. | Convert completed research into reversible implementation work while keeping tasks editable and evidence-backed. |
