# Repository Understanding Research

## Decision brief

Status: complete.

Spark's current repository model is not repository-neutral. The active GitHub path recognizes JS/TS workspaces, reduces their structure to `Project[]`, and maps changed files into project-name strings. Unsupported structures collapse into `Repository root`, while unknown structure and unknown evidence coverage can directly raise attention. The research is testing whether a claim-oriented repository model can preserve repository-native facts, accept enrichment from multiple sources, and project into the existing product without defining the new core around current strings.

The result is **VIABLE WITH REVISIONS**. Retain the layered hybrid, but make observed repository/change artifacts first-class and split evidence execution, attribution, and expectation before treating it as a durable foundation. Preserve current product behavior through compatibility projections while the richer model is validated later.

## Scope and method

This investigation covers repository-native evidence, generic repository understanding, ecosystem and declared enrichment, evidence attribution, compatibility projections, and attention inputs. It does not cover production implementation, migrations, delivery sequencing, attention threshold tuning, or frontend redesign.

The evidence hierarchy is:

1. Current source and tests for current behavior.
2. Commit and branch contents for historical behavior.
3. Pinned public repository snapshots, pull-request diffs, checks, and repository documentation.
4. Synthetic cases for controlled edge conditions.
5. Documentation or design claims only when corroborated by exercised behavior.

## Current baseline

### Active pipeline

The current path is:

```text
GitHub pull request and exact head SHA
  -> changed files plus completeness
  -> repository tree and JS/TS workspace manifests
  -> Project[] plus repository-context knowledge
  -> normalized check runs with UNKNOWN project coverage
  -> direct-area strings, downstream project strings, and sensitive-surface strings
  -> deterministic LOW/MEDIUM/HIGH attention
  -> persisted evaluation and neutral GitHub Check
```

Current repository understanding has four important properties:

- `Project` contains only a name, one path, and dependencies identified by project name.
- Repository discovery only derives projects from npm-compatible workspace metadata and returns unknown for unsupported repository structures.
- File-to-project mapping uses longest path-prefix matching; generic detectors add a few named area strings such as `CI/CD`, `Infrastructure`, and `Dependency Management`.
- Generic GitHub Check Runs are observed facts, but their project coverage is explicitly unknown.

### Conflated concepts

The active evaluator currently uses the same string collections as both semantic output and attention input. This conflates:

- A project discovered from a manifest with a generic path classification.
- Absence of supported topology with the semantic area `Repository root`.
- A sensitive artifact classification with a repository area.
- A Check Run status with the separate question of what the check validates.
- Incomplete repository understanding with elevated human attention.

### Historical profile evidence

Commit `1f478a0` (`implement truthful repository context`) provides direct source evidence that profile support previously existed in an evaluable path. It:

- Loaded `.spark/profile.yml` from the pull request base commit.
- Validated a proposed profile from the head commit when the profile changed.
- Added configured areas to repository context.
- Matched changed and previous paths against configured areas.
- Exposed owners, criticality, expected evidence, unmapped paths, and profile validation state.
- Synthesized `MISSING` evidence for configured expectations that were not observed.
- Used configured criticality and missing expected evidence in attention evaluation.

The historical model was useful but still represented workspace projects, profile areas, generic path areas, and sensitive surfaces through parallel structures and string projections. It did not provide a shared provenance-bearing claim substrate.

The branch graph narrows the lifecycle explanation. `1f478a0` is not an ancestor of the current branch; its merge base with the current branch is the initial V0 implementation (`94338de`). The repository-context implementation remained on the parallel `v0.1/repository-context` line. Separate profile fixture commits (`c5b8904` and `4a0a614`) do occur in the current lineage, which explains why `.spark/profile.yml` and profile-oriented workflows remain while the active loader is absent. The supported conclusion is therefore **historically exercised on a parallel implementation line, but not integrated into the current evaluator lineage**, not a demonstrated post-merge regression.

## Epistemic map

| Stage | Current examples | Classification | Required separation in the candidate model |
| --- | --- | --- | --- |
| Repository/change observation | Repository identity, PR base/head, changed path/status, file-count completeness, recursive tree paths, Check Run name/source/status/URL | Facts reported by GitHub | Preserve immutable provider facts and their acquisition completeness. |
| Normalization | GitHub conclusions mapped to Spark evidence status | Deterministic derived fact | Retain the original provider value or provenance reference. |
| Structural discovery | Workspace manifest mapped to `Project`, manifest dependency mapped to project path | Adapter-derived claim | Identify the adapter and supporting artifacts separately from epistemic strength. |
| Generic path interpretation | `CI/CD`, `Infrastructure`, `Dependency Management`, sensitive surfaces | Heuristic claim | Represent classification/boundary claims instead of inserting names into the area identity set. |
| Change projection | `directAreas`, `affectedAreas`, `sensitiveSurfaces` | Lossy presentation/evaluation projection | Keep links to underlying memberships, relationships, and boundary claims. |
| Evidence coverage | `UNKNOWN` for every generic GitHub Check | Unknown claim state | Separate observed execution from attributed coverage. |
| Attention | LOW/MEDIUM/HIGH and reasons | Product policy derived from prior claims | Consume claims and completeness without becoming their storage model. |

## Repository-native signal inventory

| Signal | Current ingestion | Useful generic knowledge | Important limit |
| --- | --- | --- | --- |
| Changed paths and statuses | Yes | Directly changed artifacts and candidate structural regions | Paths do not establish functional identity or impact by themselves. |
| Changed-file completeness | Yes | Whether the observed change set is bounded | Completeness is change-level, not confidence in every semantic claim. |
| Recursive repository tree | Yes | Repeated regions, nearby metadata, candidate containment, generated/vendor/test classification | Directory depth and naming conventions vary; trees can truncate. |
| Selected manifest contents | JS/TS workspace files only | Ecosystem units and dependencies | Requires adapters; scanning every manifest is unsafe because fixtures may contain many fake projects. |
| Pull-request base/head and metadata | Partly | Exact change identity and profile/config comparison | Current adapter does not use commits, review lifecycle, labels, or historical changes. |
| Check Runs | Yes | A named external process ran for the exact SHA and reported a state | Name/status alone does not prove area or boundary coverage. |
| Workflow definitions | Retrievable, not interpreted | Trigger scope, commands, matrices, declared targets, job dependencies | Workflow semantics can be dynamic; external CI definitions may live elsewhere. |
| CODEOWNERS / nested OWNERS | Retrievable, not interpreted | Declared responsibility and possible structural boundaries | Ownership zones are not automatically architectural areas. |
| Build targets and dependency metadata | JS workspaces only | Strong adapter-derived units, edges, test targets, and generated relationships | Bazel, Cargo, Go, Maven, and others need ecosystem-aware interpretation. |
| Git and PR history | Not ingested | Co-change evidence, path moves, stable region candidates, and historical check associations | Statistical association is not dependency; history can be shallow, young, or workflow-biased. |
| Diff hunks and patches | Not ingested | Rename/source-generation clues and change intent evidence | Higher data volume and source sensitivity; still cannot reliably establish semantics alone. |

Repository-native baseline should therefore mean **useful structural claims with explicit limits**, not pretending generic discovery can recover business semantics from directory names.

## Open research questions

1. Which useful area and boundary claims can be established from ordinary repository evidence without configuration?
2. What minimum representation allows structural, architectural, and organizational interpretations to coexist?
3. How should Spark distinguish epistemic strength from the source that produced a claim?
4. What repository-native evidence can attribute checks to areas, boundaries, relationships, or changes?
5. Can a richer model reproduce current product inputs through a compatibility projection without inheriting their conceptual conflations?
6. Does the same core vocabulary remain coherent in Spark, Stint, Python, Rust, large Go, Bazel/polyglot, flat-service, and disjoint-functional-area repositories?

## Research corpus

| Repository | Shape under test | Pin | Selected changes | Status |
| --- | --- | --- | --- | --- |
| Spark | JS/TS workspace and current compatibility | `c0dcea9` | `d2056ae`, `551e7ef`, `87a625d`, `7d7611d` | Complete; immutable local commits |
| Stint | Go repository and nested provider areas | `d34cb2b` | #21, #13, #10, #4 | Complete; immutable PR commits, dirty worktree untouched |
| `django/django` | Python monolith | `73cc09f` | #21803, #21749, #21808, #21746 | Metadata and checks captured |
| `rust-lang/cargo` | Rust workspace | `0c507b7` | #17406, #17382, #17385, #17366 | Metadata and checks captured |
| `kubernetes/kubernetes` | Large Go repository | `e72c271` | #141500, #141593, #141658, #141478 | Metadata and checks captured |
| `bazelbuild/bazel` | Polyglot repository with build graph | `bf49a0e` | #30918, #30666, #30720, #30656 | Metadata and checks captured |

Each repository will contribute localized, cross-area, build/CI, and interface/schema/generated-boundary changes where its history supplies suitable examples.

### Spark change sample

Spark's configured GitHub origin did not expose a merged pull-request list through the available authenticated API, so this sample uses immutable local commits rather than inventing missing PR metadata.

| Category | Commit | Repository evidence |
| --- | --- | --- |
| Localized | `d2056ae` | API favorite-scoping implementation and its focused test. |
| Cross-area | `551e7ef` | API migration/runtime, dashboard contract, web API/UI, browser test, documentation, and README. |
| CI definition | `87a625d` | One GitHub Actions workflow change. |
| Shared product contract | `7d7611d` | API trajectory logic, shared dashboard contracts, web consumers, tests, and documentation. |

The corpus pin `c0dcea9` remains the repository snapshot against which structure and current consumers were inspected.

### Public change sample

| Repository | Localized | Cross-area | Build / dependency / CI | Interface / generated boundary |
| --- | --- | --- | --- | --- |
| Django | [#21803](https://github.com/django/django/pull/21803): ORM compiler/query and focused tests | [#21749](https://github.com/django/django/pull/21749): ORM behavior, model fixture, tests, reference docs, deprecation, and release notes | [#21808](https://github.com/django/django/pull/21808): optional daily-build requirements | [#21746](https://github.com/django/django/pull/21746): public model validation check, documentation, and invalid-model tests |
| Cargo | [#17406](https://github.com/rust-lang/cargo/pull/17406): Git source utility and focused test | [#17382](https://github.com/rust-lang/cargo/pull/17382): configuration schema, compiler fingerprinting, reporting, docs, and tests | [#17385](https://github.com/rust-lang/cargo/pull/17385): CI workflow behavior | [#17366](https://github.com/rust-lang/cargo/pull/17366): workspace path behavior and profile tests |
| Kubernetes | [#141500](https://github.com/kubernetes/kubernetes/pull/141500): one `apiextensions-apiserver` test-server file | [#141593](https://github.com/kubernetes/kubernetes/pull/141593): controller, staging library, utilities, and integration test | [#141658](https://github.com/kubernetes/kubernetes/pull/141658): root and staging module metadata plus vendored dependency output | [#141478](https://github.com/kubernetes/kubernetes/pull/141478): generator source and roughly seventy generated client interfaces |
| Bazel | [#30918](https://github.com/bazelbuild/bazel/pull/30918): Skyframe evaluator and test | [#30666](https://github.com/bazelbuild/bazel/pull/30666): remote execution, auth/TLS, build-event service, protobuf, BUILD metadata, and tests | [#30720](https://github.com/bazelbuild/bazel/pull/30720): module/lock metadata and platform integration tests | [#30656](https://github.com/bazelbuild/bazel/pull/30656): repository-extension metadata across runtime, package loading, BUILD targets, and tests |

### Controlled archetypes

1. **Flat service:** root manifest, `src/`, `tests/`, one workflow, and no nested package boundary. This tests whether generic understanding remains useful without inventing directory-level services.
2. **Polyglot monorepo:** independently buildable Python, Rust, and TypeScript regions plus shared schemas and repository-wide CI. This tests multiple adapters contributing to one core vocabulary.
3. **Disjoint functional area:** implementation, CLI integration, documentation, and deployment configuration for one capability live under separate roots. This tests declared grouping and overlapping structural/functional views.

### Stint change sample

| Category | Change | Repository evidence |
| --- | --- | --- |
| Localized provider change | [#21](https://github.com/Marguelgtz/Stint/pull/21) | Two files under `internal/provider/vast`; generic structure can identify the nested region, a Go adapter can identify its package, and the profile names it `vast-compute-provider`. |
| Cross-area runtime change | [#13](https://github.com/Marguelgtz/Stint/pull/13) | Five `cmd/stint` files and `internal/session/state.go`; the configured functional area groups them, while structural views retain their distinct roots. |
| Release change | [#10](https://github.com/Marguelgtz/Stint/pull/10) | One command entrypoint file; release meaning comes from PR/commit context rather than path alone. |
| Provider/lifecycle boundary | [#4](https://github.com/Marguelgtz/Stint/pull/4) | CLI lifecycle, core plan, Vast provider, session state, and tests cross several structural regions. |

All four changes report `spark-profile`, `go-vet`, and `unit-tests` as successful. The workflow shows that `go-vet` runs `go vet ./...` and `unit-tests` runs `go test ./...`. The executions are observed facts; repository-wide Go package intent is an adapter-supported attribution derived from the command, not from either Check Run name.

## Candidate vocabulary under test

The research starts with the following provisional concepts. These are not committed production types.

```text
RepositoryUnderstanding
  areas
  memberships
  relationships
  boundaries
  evidence and evidence-attribution claims
  completeness

Area
  stable or provisional identity
  human-readable label
  optional roles

AreaMembership
  area
  repository locator or matched artifact
  optional classification view
  provenance
  confidence

AreaRelationship
  source area
  target area
  relationship type
  provenance
  confidence

Boundary
  kind
  matched artifacts
  connected areas where known
  provenance
  confidence
```

The central hypothesis is that observed repository data should remain immutable facts, while membership, relationship, boundary, impact, and evidence-attribution statements are separately retained claims. Presentation and attention can then resolve or project those claims without destroying their sources.

### Revision required by the corpus

The initial vocabulary is incomplete without explicit observations. The candidate foundation must distinguish three layers:

```text
Observations
  RepositorySnapshot
  ChangeObservation
  ArtifactObservation
  EvidenceRun

Semantic claims
  Area
  AreaMembership
  AreaRelationship
  Boundary
  EvidenceAttribution
  EvidenceExpectation
  CompletenessAssessment

Policy projections
  primary/direct areas
  affected areas
  sensitive surfaces
  evidence summary
  attention
  presentation
```

An `EvidenceRun` records that a provider reported a named process and state for a revision. `EvidenceAttribution` is a separate claim connecting that run to artifacts, areas, boundaries, relationships, or the whole change. `EvidenceExpectation` states that evidence ought to exist and records the repository rule, adapter inference, or profile declaration supporting that expectation.

### Claim support dimensions

Every semantic claim needs support metadata with separate axes:

| Axis | Purpose | Example values |
| --- | --- | --- |
| Provenance source | Who or what supplied the claim | generic analyzer, Cargo adapter, Go adapter, workflow analyzer, profile, GitHub |
| Derivation | How the claim was produced | declared, deterministic derivation, heuristic inference |
| Confidence | How strongly the available support establishes the claim | supported, tentative, unknown |
| Evidence references | Which observed artifacts or runs support it | manifest path, workflow path, Check Run ID, changed artifact ID |
| Scope and completeness | What portion of the relevant input was available | complete tree, truncated files, partial workflow interpretation |

No numeric confidence is justified by the corpus. “Observed” should describe provider facts, not act as a general high-confidence label for semantic interpretation.

### Minimal relationship and boundary posture

The foundation only needs a small built-in relationship vocabulary initially:

- `contains` or explicit parent linkage for hierarchy.
- `depends_on` for adapter-supported impact traversal.
- `generated_from` where repository evidence establishes a source/output relationship.

Additional relationships such as `tests`, `documents`, `deploys`, or `owns` should be qualified claims rather than assumed universal semantics. Relationship types must remain extensible without reducing them to unvalidated free-form display strings.

Boundaries remain distinct from areas. A boundary identifies a change-relevant interface or sensitive crossing—such as a public schema, generated API, CI definition, dependency surface, deployment surface, or security surface—and can connect zero or more areas. Unknown connected areas do not invalidate an observed boundary artifact.

## Cross-repository model probes

| Case | Repository-native baseline | Enrichment | Relationship / boundary result | Evidence result |
| --- | --- | --- | --- | --- |
| Spark workspace change | Tree establishes `apps/*` and `packages/*` as candidate regions | pnpm metadata identifies workspace units and dependencies; profile adds overlapping organizational and functional identities | Workspace dependencies support `depends_on`; workflows and shared contracts remain separate boundary claims | Path filters support trigger relevance; `pnpm test` and filtered commands need workspace-aware attribution |
| Stint #21 | Changed paths establish a coherent nested `internal/provider/vast` region without configuration | Go metadata identifies a package; profile names the stable functional area and expectations | No downstream dependency is established from paths alone | `go test ./...` and `go vet ./...` support repository-wide Go intent; successful runs remain separate observations |
| Stint #13 | `cmd/stint` and `internal/session` remain distinct structural regions | Profile groups command/runtime paths into `interactive-control-plane` | Overlapping structural and functional memberships are both useful; neither should overwrite the other | Same repository-wide Go intent, but no proof that every runtime behavior is exercised |
| Django #21803 | Production and test regions are both visible; the root package metadata says Django is one distribution | Python/test conventions or history can associate tests with ORM behavior, but root packaging alone cannot | A strict project model produces only one project and loses the ORM subsystem; directory-only inference cannot prove the test relationship | Checked-in workflow runs the Python suite broadly; database matrix checks add environment evidence without exact ORM-claim coverage |
| Cargo #17382 | Compiler, configuration, reporting, docs, and tests appear as several structural regions | Cargo metadata identifies workspace members, but the primary Cargo package contains multiple internal subsystems | Schema/configuration is a cross-cutting boundary within one package; workspace units alone are too coarse | `cargo test -p cargo`, workspace tests, schema, resolver, docs, and platform matrices support different scopes that an adapter can distinguish |
| Kubernetes #141593 | Controller, staging library, utility, and integration-test paths are distinct | `go.work` identifies the staging module; nested OWNERS add responsibility claims | Root controller code and published staging module cross a meaningful module boundary | Check executions are observed, but Prow configuration is external and coverage remains unknown without an adapter |
| Kubernetes #141478 | One generator source and many generated interfaces are observed | Go/code-generator knowledge identifies generator and output families | `generated_from` preserves causal grouping while public generated interfaces remain boundary artifacts | `pull-kubernetes-apidiff-client-go` is suggestive and successful, but name-only attribution is not proof |
| Kubernetes #141658 | Root/staging module files and vendor outputs are observed | Go workspace/module metadata identifies affected published units and dependency graph | Dependency-update boundary has broad fan-out; vendor files should not become independent areas | Dependency-stat and broad presubmits ran; exact module coverage depends on external job semantics |
| Bazel #30666 | Auth, remote execution, build-event service, protobuf, BUILD, and tests form several regions | BUILD targets provide precise package/dependency evidence; CODEOWNERS adds responsibility | Protobuf is a shared interface boundary; BUILD edges support impact without defining core vocabulary around Bazel | Presubmit targets can support strong target-level attribution through a Bazel adapter |
| Bazel #30720 | Module metadata and platform test paths are directly observed | Bazel module/lock semantics identify dependency and generated-lock relationships | Dependency boundary crosses repository configuration and platform-specific tests | Presubmit target sets are explicit, but one failed Windows shard demonstrates status and coverage must remain per run/target |
| Flat synthetic service | Root manifest, `src`, `tests`, workflow | Ecosystem adapter may identify one package | One repository area with nested structural regions is sufficient; no fake services required | Whole-package commands can support broad intent without claiming behavioral completeness |
| Polyglot synthetic monorepo | Language roots and shared schema are visible | Multiple adapters contribute areas and dependencies | Shared schema connects ecosystem-specific areas through generic boundary/relationship claims | Each workflow/run receives its own scoped attribution; no single adapter owns repository truth |
| Disjoint functional synthetic area | Separate structural regions remain independently observable | Profile declares a stable functional identity spanning them | Many-to-many memberships and multiple views are required | Profile expectations supplement, rather than replace, repository-observed runs |

### Probe conclusion

The layered hybrid is viable only with the observation layer and split evidence concepts added above. A single hierarchy fails Stint's grouped functional area and Spark's overlapping profile areas. A workspace-only model fails Django and Cargo's internal subsystems. A directory-only model fails generated relationships and Bazel targets. A full universal graph can represent the cases but is not required to preserve the evidence needed for later policy.

## Evidence-attribution rules supported by the research

1. A Check Run always supports only the fact that a named provider process reported a state for a revision.
2. Checked-in workflow triggers can support whether a run was eligible or intentionally excluded for paths; they do not establish test coverage.
3. Checked-in commands and targets can support intended validation scope when an analyzer understands their ecosystem semantics.
4. Dynamic scripts, reusable workflows, external CI configuration, and conditional steps lower attribution completeness unless their invoked behavior is also resolved.
5. A passed run never upgrades all related semantic claims to “covered”; attribution remains scoped to what its command/target establishes.
6. An absent run is `MISSING` only when an expectation is supported by a repository rule, required-check policy, adapter rule, or declared profile. Otherwise it is unobserved/unknown.
7. A failed attributed run is evidence about the targeted scope, but attention remains a separate policy decision.
8. Conflicting or duplicate runs remain separate observations; reconciliation belongs to evidence-summary policy.

## Generic, adapter, and declared responsibilities

| Layer | May establish | Must not claim without enrichment |
| --- | --- | --- |
| Repository-native generic | Changed artifacts, structural candidate regions, containment, metadata presence, workflow/check observations, completeness, cautious path classifications | Package semantics, functional identity, dependency edges, test coverage, ownership meaning |
| Ecosystem/architecture adapter | Authoritative workspace/module/target membership, supported dependencies, generated relationships, command/target evidence scope | Business criticality, organizational ownership, deployment significance not expressed by the repository |
| Declared profile/organization | Stable names/IDs, functional grouping, ownership, criticality, expected evidence, organizational boundaries | Replacement of conflicting observed facts or fabricated execution evidence |
| Evaluation/presentation | Primary selections, affected-area propagation, summaries, attention | Mutation or deletion of underlying claims needed for later policy changes |

## Findings log

### F-001: Architecture terminology is ahead of the active core model

`docs/ARCHITECTURE.md` already names Repository, Change, Project, Area, Relationship, Evidence, and SparkEvaluation as conceptual entities. The active TypeScript model implements Project and Evidence but not Area, Relationship, Boundary, or individual claim provenance. The research is therefore refining an intended direction rather than introducing repository semantics from nowhere.

### F-002: `KnowledgeClass` and provenance answer different questions

The current `KnowledgeClass` values (`observed`, `derived`, `inferred`, `unknown`) describe how directly Spark knows something. They cannot also identify whether a claim came from generic discovery, an ecosystem adapter, a profile, a GitHub API observation, or a user declaration. These must be investigated as separate dimensions.

### F-003: Historical profile behavior demonstrates enrichment and conflation simultaneously

The historical profile path proves configured area identity, ownership, criticality, and expected evidence can enrich evaluations. It also added profile area IDs directly to the same `directAreas` string set as projects and generic classifications. Restoring that exact representation would recover functionality but would not establish the required generic foundation.

### F-004: Check metadata is evidence of execution, not self-authenticating coverage

The public cases expose large check matrices. Cargo runs platform tests, schema, resolver, docs, MSRV, and Git-backend jobs on the selected changes; Django runs database/platform matrices and selectively skips other jobs; Kubernetes exposes broad presubmit contexts; Bazel exposes many Buildkite platform shards. Names and results establish that jobs ran, but do not by themselves prove which changed areas, generated outputs, or dependency boundaries each job validates. Workflow definitions, triggers, commands, build targets, or declared knowledge are required for stronger attribution.

### F-005: Generated and dependency changes require causal boundaries, not path-count semantics

Kubernetes #141478 changes one generator source alongside roughly seventy generated interface files. Kubernetes #141658 changes module metadata across many staging modules and a large vendor update. Treating every changed path as an independent semantic area exaggerates breadth, while collapsing everything to one directory hides impact. The model needs to retain observed files while allowing a generator or dependency-update claim to explain causal grouping and downstream reach.

### F-006: Repository areas are not uniformly deployable or package-shaped

Django's selected changes align with framework subsystems and paired test modules without workspace manifests. Cargo combines compiler internals, configuration schema, documentation, and integration suites inside one Rust package. Kubernetes has nested staging modules that are both repository regions and separately published units. Bazel's meaningful regions often follow Java packages and BUILD targets. A generic Area cannot be defined exclusively as a workspace, package, deployable service, or first-level directory.

### F-007: Manifest presence must be scoped by authoritative roots

Cargo's pinned tree contains many `Cargo.toml` files under test fixtures. Treating every manifest as a repository project would manufacture hundreds of false areas. Generic discovery may locate candidate metadata, but an ecosystem adapter must interpret root workspace membership, exclusions, nested fixtures, and dependency semantics before asserting architectural units.

### F-008: Ownership is valuable declared evidence but not an area definition

Kubernetes contains deeply nested `OWNERS` files with inherited and non-inherited responsibility. These files can contribute ownership claims and may support candidate boundary confidence, but their zones are governance constructs. The core must not assume that every ownership boundary is a dependency, deployable, or functional boundary.

### F-009: Evidence attribution has distinct support levels

The cases support at least four non-numeric attribution levels:

1. **Observed execution:** GitHub reports that a check ran for the exact SHA and its result.
2. **Repository-supported intent:** a checked-in workflow declares triggers, commands, matrices, or targets relevant to the check.
3. **Adapter-derived coverage:** an adapter interprets commands such as `go test ./...`, `cargo test --workspace`, or Bazel target patterns against discovered areas and relationships.
4. **Declared expectation:** a profile or repository policy states that named evidence is expected for an area or boundary.

These levels can coexist. They must not be collapsed into one confidence number or treated as equivalent proof.

### F-010: Trigger scope and validation coverage are different claims

Spark workflows use path filters to decide when a workflow runs; Django's main test workflow ignores documentation-only changes; Cargo runs a broad CI workflow on pull requests; Bazel's presubmit file declares platform-specific build/test targets. Trigger rules establish eligibility, while commands and targets support coverage claims. Neither alone proves that a passing job validates every affected semantic area.

### F-011: External CI can leave coverage unknowable from the repository under review

Kubernetes exposes successful Prow-style checks but does not define those jobs in its `.github` directory. Spark can observe the executions, and specific names such as `pull-kubernetes-apidiff-client-go` are informative, but strong coverage attribution may require an external CI adapter or declared knowledge. The truthful generic state remains observed execution with unknown coverage.

### F-012: Co-change history is supporting evidence, not structural truth

Stint's short history repeatedly changes `internal/provider/vast/instance.go` with its test and changes `cuda_policy.go` with its test, supporting tentative test/implementation associations. Other commits touch the provider alongside command, core, session, documentation, and configuration paths, showing that co-change can also reflect feature delivery rather than dependency. Spark's current lineage contains only the initial commit for `packages/core/src/types.ts`, so it cannot support meaningful statistical inference for that path. Historical signals must retain sample size and recency completeness and cannot define areas or dependencies by themselves.

## Compatibility projection analysis

The existing representations have a wider compatibility surface than the GitHub Check alone. They are stored in normalized evaluation details, used for trajectory set deltas, exposed through dashboard contracts, formatted by the CLI, and rendered throughout current web summaries. The research therefore treats compatibility projection as an architectural boundary.

### Projection behavior to preserve

| Existing representation | Candidate projection |
| --- | --- |
| `RepositoryContext.projects` | Areas recognized by an adapter as project/package/workspace units and having a usable primary locator, plus supported `depends_on` edges. |
| `directAreas` | Display-eligible areas with memberships matched to changed artifacts; current special labels can be emitted from boundary/classification claims during compatibility mode. |
| `affectedAreas` | Reverse traversal of supported `depends_on` relationships from projected direct areas, plus explicit repository-wide compatibility markers where current behavior requires them. |
| `sensitiveSurfaces` | Display names projected from matched boundary claims. |
| `Evidence.coverage` | Area names derived from evidence-attribution claims accepted by the compatibility policy; `UNKNOWN` when no adequate attribution exists. |
| `AnalysisCompleteness` | A compressed summary of per-source and per-dimension completeness, with notes retaining important limitations. |

The projection deliberately loses overlapping memberships not selected for display, alternative names/views, multi-path bindings, claim support, relationship provenance, boundary-to-area links, and evidence-attribution rationale. Those losses are acceptable only if the underlying research model retains them outside the legacy representation.

### Compatibility constraints discovered

- Current trajectory logic treats area and sensitive-surface strings as stable set members. Changing labels would manufacture historical additions/removals.
- Dashboard and CLI consumers do not require the richer model in this round.
- Current normalized details cap arrays at 500 items and text at 2,000 characters. A complete claim model cannot be assumed to fit the existing bounded JSON without its own later storage design.
- Current attention reads the compatibility strings directly. Keeping it unchanged during a parallel comparison isolates repository-model differences from policy changes.
- A minimal inspection artifact may expose claim counts, provenance, confidence, and projection rationale for research validation, but this does not justify general frontend redesign.

## Attention and uncertainty audit

The current evaluator mixes change significance, evidence state, and analysis uncertainty:

| Current rule | Current result | Semantic category |
| --- | --- | --- |
| Failed observed evidence | HIGH | Evidence outcome; not uncertainty. |
| Critical surface or multiple areas plus critical infrastructure | HIGH | Change classification/significance. |
| Downstream fan-out | MEDIUM or HIGH | Inferred impact significance, bounded by relationship quality. |
| Affected area plus unknown/no evidence coverage | HIGH | Evidence-attribution uncertainty currently treated as attention. |
| Explicitly uncovered affected area | HIGH | Potentially missing expected evidence, but only valid if coverage expectations are established. |
| Pending evidence | MEDIUM | Evidence lifecycle state. |
| No observed evidence | MEDIUM | Absence/unknown expectation currently treated as attention. |
| `Repository root` with no projects | MEDIUM | Structural uncertainty currently treated as attention. |
| `Unmapped area` | MEDIUM | Membership uncertainty currently treated as attention. |
| Incomplete changed-file list | At least MEDIUM | Observation completeness currently treated as attention. |

This audit does not propose replacement thresholds. It establishes why repository understanding, evidence attribution, completeness, and attention must become separately inspectable before policy is revised.

## Alternative analysis

| Criterion | Expanded single Area | Full universal graph | Layered hybrid with observations and claims |
| --- | --- | --- | --- |
| Repository-native zero-config | Can represent inferred regions | Can represent all observed artifacts | Represents observations separately and promotes supported regions into areas |
| Multiple classification views | Tends to overload Area attributes | Natural | Natural through many-to-many memberships and optional views |
| Boundaries | Usually becomes tags on Area | Natural as nodes/edges | First-class bounded claims without making every artifact a graph node |
| Evidence attribution | Awkward unless added beside Area | Natural | Explicit EvidenceRun, Attribution, and Expectation concepts |
| Ecosystem enrichment | Possible but merge rules accumulate inside Area | Natural | Adapters contribute the same bounded claim types |
| Compatibility projection | Simple initially | Requires graph queries for every legacy field | Direct projections from typed collections |
| Reversibility | Low once meanings are merged into Area | High expressiveness but high foundational commitment | High; raw observations and claims survive policy changes |
| Complexity | Lowest initially, but semantic overload grows | Highest ingestion, identity, query, and persistence burden | Moderate and proportional to demonstrated cases |
| Corpus result | Fails to keep ownership, boundaries, project identity, and functional overlap distinct | Represents all cases but solves more than this round requires | Represents all cases after adding the explicit observation/evidence split |

The expanded Area option is rejected as the foundation because it recreates representation leakage inside a broader object. The full graph is deferred: it remains a possible internal evolution if later artifact-level queries require it, but the current corpus does not justify universal node/edge semantics. The layered hybrid is retained with revisions.

## Viability assessment

Classification: **VIABLE WITH REVISIONS**.

| Gate | Result | Evidence |
| --- | --- | --- |
| Useful without configuration | Pass with bounded claims | Stint's nested provider region, Django subsystems, changed paths, manifests, workflows, and boundaries are useful before profiles, while uncertainty stays explicit. |
| Architecture-neutral core | Pass | JS workspaces, Go modules, Cargo workspaces, Python monolith subsystems, Bazel targets, and synthetic polyglot cases fit without ecosystem-specific core fields. |
| Multiple knowledge sources | Pass | Generic regions, adapter units/edges, OWNERS/CODEOWNERS, workflows, and profiles contribute separate claims. |
| Provenance and uncertainty | Pass after revision | Separate observations, provenance, derivation, confidence, evidence references, and completeness are required. |
| Evidence centrality | Pass after revision | EvidenceRun, EvidenceAttribution, and EvidenceExpectation must be distinct. |
| Overlap and hierarchy | Pass | Many-to-many membership represents Spark profile overlap, Stint functional grouping, and structural hierarchy without selecting one policy. |
| Meaningful relationships and boundaries | Pass | Minimal `depends_on`, containment, and `generated_from` plus separate boundary claims cover demonstrated cases. |
| Large-repository truthfulness | Conditional pass | Complete pinned GitHub trees were available for the four public repositories, but every source still needs independent bounds and truncation state. |
| Legacy compatibility | Pass conceptually | All current fields have explicit projections; information loss is documented. Runtime equivalence remains a later implementation validation. |
| Frontend stability | Pass | Existing surfaces can continue consuming legacy projections; only research/debug inspection may need a minimal non-product artifact. |

The revisions are foundational rather than optional:

1. Add a first-class observation layer instead of treating paths and Check Runs as semantic objects.
2. Split evidence execution, attribution, and expectation.
3. Separate provenance source, derivation, confidence, and completeness.
4. Treat current strings as projections rather than canonical identity.

With those revisions, no corpus case requires a JavaScript-, Go-, Python-, Rust-, Kubernetes-, Stint-, Spark-, or Bazel-specific field in the generic vocabulary.

## Research decisions

1. **Retain the layered hybrid, revised around observations and claims.**
2. **Make Area a semantic repository unit, not a synonym for directory, package, service, owner, or deployable.**
3. **Represent area-to-artifact association through many-to-many memberships.**
4. **Keep boundaries distinct from areas and sensitive display labels.**
5. **Keep evidence runs, attribution, and expectations distinct.**
6. **Use ecosystem adapters to interpret authoritative metadata without adding ecosystem fields to the core.**
7. **Use profiles as declared enrichment and stable identity, never as the prerequisite for useful output.**
8. **Preserve current evaluation and frontend contracts through lossy, documented compatibility projections during validation.**
9. **Do not retune attention until uncertainty and evidence attribution are available separately.**
10. **Do not adopt a universal artifact graph until a demonstrated query requires it.**

## Rejected or deferred policies

The research intentionally does not decide:

- Primary-area selection.
- Whether overlapping memberships are shown together.
- Automatic merging of inferred and declared area identities.
- Profile or adapter precedence.
- Stable identity across arbitrary path moves.
- Confidence-to-attention mapping.
- Downstream propagation depth or relationship weighting.
- Historical reprocessing of prior evaluations.
- Persistence layout, API schema, rollout sequence, or implementation ownership.
- Richer dashboard, activity, PR, graph, navigation, or settings experiences.

## Evidence gaps

- Public PR Check Runs prove execution but logs were not inspected; command-level attribution relies on checked-in workflow/config definitions where present.
- Kubernetes Prow job definitions are external to the repository under review and remain unresolved.
- The public sample is deliberately architecture-diverse, not statistically representative.
- Synthetic cases validate representability, not observed production behavior.
- Compatibility projections are proven conceptually against current consumers, not executed in a shadow implementation.
- Historical profile behavior is proven in source and exercised branch history, but production deployment identity is not reconstructed.

## Completion audit

| Research requirement | Status | Authoritative evidence in this RFC |
| --- | --- | --- |
| Current and historical baseline | Complete | Active pipeline, conflations, historical profile evidence, branch ancestry. |
| Repository-native baseline | Complete | Signal inventory and generic/adapter/declared responsibility table. |
| Evidence-centered investigation | Complete | Public Check Runs, checked-in workflows, external CI limitation, attribution rules. |
| Spark and Stint validation | Complete | Immutable Spark commits, Stint PRs, profiles, workflows, and model probes. |
| Additional real repositories | Complete | Four pinned public repositories and sixteen categorized PRs. |
| Synthetic edge cases | Complete | Three controlled archetypes and matrix outcomes. |
| Candidate vocabulary | Complete with required revision | Observation, semantic-claim, and projection layers plus support axes. |
| Alternative comparison | Complete | Expanded Area, full graph, and revised layered hybrid comparison. |
| Compatibility and frontend stability | Complete | Projection mapping, current consumer inventory, and documented loss. |
| Attention/uncertainty separation | Complete | Current-rule semantic audit without retuning. |
| Viability decision | Complete | `VIABLE WITH REVISIONS` with gate-by-gate evidence. |
| Decisions, deferrals, and gaps | Complete | Explicit research decisions, deferred policies, and evidence gaps. |
| No development plan | Complete | No production tasks, estimates, migrations, rollout sequence, or frontend redesign are specified. |
