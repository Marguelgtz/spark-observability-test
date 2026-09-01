# Spark CI/CD Process Intelligence — Research & Living Action Plan

Status: **active living plan.** G0 through bounded G7 are **DONE** on the shadow `RepositoryUnderstanding` path. Spark now retains exact-revision process/evidence facts and supported claims, derives a deterministic verification graph, replays point-in-time state from bounded idempotent records, and produces bounded provenance-bearing process insights for normal activity, failure localization/domain, repository-backed reproduction, dependency blockage, matrix/retry behavior, missing expectations, verification gaps, and recovery. Unsupported expectations remain `UNKNOWN`; only supported expectations plus complete evidence acquisition become `NOT_OBSERVED`. CI-306 and deployment insight CI-710 remain explicitly **BLOCKED but non-blocking**. Live ingestion and attention policy remain untouched. CI-801 (runtime baselines) is **READY** next for historical process intelligence.

Purpose: before any work toward automatic agent steering, make CI/CD a first-class source of repository and process intelligence. The immediate goal is **not** to tell an agent what to do. It is:

> **Make Spark understand what the repository says should happen, what the CI/CD system actually did, what that execution means for the changed software, and what remains unknown.**

This work strengthens Spark independently of Stint, Cline, or any future agent integration.

Research basis (already in-repo):
- [`AGENT_STEERING_DATA_AND_ARCHITECTURE_INTELLIGENCE.md`](./AGENT_STEERING_DATA_AND_ARCHITECTURE_INVESTIGATION.md) — the data/architecture investigation; its §3 conflation ledger (C1–C6) and §6 dataset audit are the empirical foundation for the CI-001 loss map below.
- [`REPOSITORY_UNDERSTANDING_ACTION_PLAN.md`](./REPOSITORY_UNDERSTANDING_ACTION_PLAN.md) — the G3 evidence gate (RU-301…RU-305) that CI-4xx must **reconcile with, not duplicate** (see Part III §3.6).
- [`REPOSITORY_UNDERSTANDING_RESEARCH.md`](./REPOSITORY_UNDERSTANDING_RESEARCH.md), [`REPOSITORY_UNDERSTANDING_COMPATIBILITY.md`](./REPOSITORY_UNDERSTANDING_COMPATIBILITY.md).
- Privacy-safe deployed-D1 aggregate: [`CI_CD_PROCESS_INTELLIGENCE_AUDIT.json`](./CI_CD_PROCESS_INTELLIGENCE_AUDIT.json) (generated 2026-08-31; 3,901 retained evaluation snapshots / 20,186 embedded evidence snapshots / 114 PRs / 2 repositories with runs). The committed artifact records metric definitions, grain, and interpretation limits; the raw D1 export remains intentionally uncommitted.

## Part I — Research & Architecture Plan

### 1. Why CI/CD belongs in Spark

Spark retains CI activity through GitHub Check Runs but sees it through an over-compressed model:

```text
revision -> check name -> status -> source -> url -> Evidence
```

Real CI/CD execution is closer to:

```text
Repository change
       -> Workflow definition
       -> Workflow run (-> attempt)
       -> job (-> step, step)
       -> deployment / environment
```

The prior trajectory analysis showed normal CI startup masquerading as evidence regression: `revision A tests PASSED` then `revision B tests PENDING` currently reads as "the repository got worse," when the truthful reading is: *A's evidence remains historically valid; B requires fresh verification that is still executing normally.* A first-class CI/CD process model addresses this directly.

### 2. Core architectural direction

Do **not** create a parallel CI subsystem. Extend the existing observation/claim/evidence model with three explicit layers:

```text
DECLARED PROCESS   repository-defined workflows, triggers, filters, jobs,
OBSERVED PROCESS    dependencies, matrices, steps, commands/actions, environments
        +
SPARK UNDERSTANDING areas, boundaries, evidence attribution, expectations,
                    completeness, trajectory, process insights
```

Provider-specific GitHub terminology stays inside the GitHub adapter; the core models the process generically.

### 3. Relationship to existing Repository Understanding

This extends the existing evidence gate rather than adding a new architecture. Repository understanding already establishes: provider-neutral observations; provenance-bearing claims; Areas; Memberships; Relationships; Boundaries; `EvidenceRunObservation`; `EvidenceAttribution`; `EvidenceExpectation`; completeness. G3 already anticipates `execution ≠ attribution ≠ expectation` and bounded interpretation of checked-in workflows. The target shape:

```text
Repository Understanding
        ├── repository structure / areas / relationships / boundaries
        └── CI/CD process
                 ├── declared process
                 ├── observed execution
                 ├── evidence attribution
                 └── evidence expectation
```

**Strategy (re-scoped from CI-001, Part I §16):** The CI/CD process model is built **on the existing `RepositoryUnderstanding` substrate** — the same provider-neutral observations, `ClaimSupport`, and the same normalization + compatibility-projector seam. Concretely:

- **Single evidence-claim seam.** There is exactly one observation/claim pipeline and one legacy projector. CI/CD process observations and evidence claims feed the *same* normalization and projection as repository structure; we do **not** stand up a second parallel evaluator or a second `Evidence` path. (CI-001 found the `RepositoryUnderstanding` substrate already exists in `packages/core` but is not yet wired into the live path — closing that gap is RU G6's job, not this round's.)
- **Provider-neutral core, provider adapter.** Core types carry no GitHub concepts; the GitHub Actions adapter (CI-2xx) is the only place GitHub terminology appears, mirroring how the RU substrate stays provider-neutral.
- **V0 proof is a shadow/derived projection.** The G0–G5 proof reconstructs the process from the data the live path already fetches **plus** new bounded Actions fetches, evaluated in shadow. It does **not** change the live `SparkInput`/`SparkEvaluation` path, the attention policy, or the neutral GitHub Check (rule 12).

### 4. Fundamental CI/CD semantic distinction

**Lifecycle and result must not be the same variable.** A pipeline/job/step has a lifecycle and, independently, an outcome.

Lifecycle: `EXPECTED | NOT_OBSERVED | QUEUED | RUNNING | COMPLETED | CANCELLED | UNKNOWN`
Outcome: `PASSED | FAILED | NEUTRAL | SKIPPED | UNKNOWN | NOT_APPLICABLE`

These names are now the shared core vocabulary established by CI-106; provider adapters must map into them without adding provider-specific core states.

- `RUNNING + NOT_APPLICABLE` is **not** failure.
- `COMPLETED + FAILED` is failure.
- `COMPLETED + SKIPPED` is **not** passing evidence.

### 5. Declared workflow/process data

Inspect repository-defined CI/CD configuration. For GitHub Actions initially, collect and interpret bounded information: workflow identity/path/name; trigger events; branch/path filters; jobs and `needs`; matrices; step names, `uses`, `run`; environment; timeouts/concurrency; reusable-workflow references.

Static interpretation stays conservative: `run: pnpm --filter @spark/api test` supports a relatively strong claim about what CI executes, but `run: ./scripts/ci.sh` only establishes that the script executes unless Spark separately inspects it. Unresolved semantics **reduce completeness**, they do not create invented certainty.

### 6. Runtime process data

Capture enough per execution to reconstruct what actually happened.

- **Pipeline run:** pipeline identity, provider run identity, revision/SHA, branch/ref, trigger event, creation time, provider URL. A run is the logical invocation and spans reruns.
- **Pipeline attempt:** run identity, attempt number, started/completed times, lifecycle, outcome, provider URL. Re-execution creates a new attempt beneath the same run.
- **Job:** job identity + run identity, logical job identity, display name, matrix identity/context, declared dependencies, runner classification, environment, lifecycle, outcome, started/completed/duration, URL.
- **Step:** step identity + job identity, sequence, name, declared action or command reference, lifecycle, outcome, started/completed/duration.

### 7. Execution identity

Do not collapse everything under a human-readable check name. Distinguish: `logical verification ≠ pipeline run ≠ run attempt ≠ job execution ≠ step execution`. This separates `attempt 1 FAILED / attempt 2 PASSED (same SHA)` (possible flakiness or environmental instability) from `revision A FAILED / revision B PASSED` (corrective work) — very different trajectories.

### 8. Failure information

Do **not** ingest raw CI logs by default (large, noisy, sensitive, provider-specific). Start with structured failure information: pipeline/job/step, outcome, annotations, file/line where available, a short normalized failure fingerprint, and a log URL. Raw logs are fetched lazily on demand. A future fingerprint (e.g. `category: TYPESCRIPT`, `code: TS2345`, `path: apps/api/src/example.ts`, `step: typecheck`) is deferred until basic process semantics are stable.

### 9. CI and CD share the same foundation

Model deployment with the same vocabulary. Initial deployment observations stay minimal: deployment identity, revision, environment, lifecycle, outcome, started/completed, approval/waiting state, deployment URL. Key distinctions: `waiting for approval ≠ deployment failure`; `deployment running ≠ deployment unhealthy`.

### 10. Verification Graph

A bounded **Verification Graph** is a *derived projection* (not a graph database) from canonical observations and claims, e.g. `Change → Area → EvidenceExpectation → Job → Step → Result`, and for a changed boundary `Change → Boundary → EvidenceExpectation → (NOT_OBSERVED)`. It connects repository understanding + CI/CD process + evidence + expectations + trajectory without introducing another source of truth.

### 11. Process insight layer (V0, deterministic, no ML)

- **Normal verification lifecycle:** "new revision pushed; N of M expected jobs running; no completed check regressed" → CI is still executing, not evidence of a defect.
- **Failure localization:** workflow / job / failed step / annotation / implicated area.
- **Setup failure:** workflow failed before application tests (e.g. `pnpm install`) — do not describe as "unit tests failed."
- **Reproduction candidate:** derive a repository-supported local command with source + confidence + caveat.
- **Downstream blocked verification:** "Integration tests did not execute because they depend on Build" — not "Integration tests failed."
- **Matrix-specific failure:** keep per-dimension results instead of collapsing to one generic failure.
- **Flake candidate:** same SHA, attempt 1 FAILED → attempt 2 PASSED (candidate, not proven).
- **Missing expected verification:** only when a supported `EvidenceExpectation` exists.
- **Verification gap:** a changed boundary/area lacks attributed verification (a gap, not a failure).
- **Recovery:** a previously failed verification now passes on the same relevant verification (enables future `RELAX`).

### 12. Historical CI/CD intelligence

Once process history accumulates: success/failure rates, job duration distributions, same-SHA retry recovery, failure-fingerprint recurrence, matrix instability, area→workflow and boundary→evidence relationships, process drift, execution gaps, deployment outcomes. **No statistical claim without denominators and sufficient history.**

### 13. Agent usefulness

Agent integration is downstream. The first useful interface gives an agent structured facts and insights, not commands to modify code: what is running, what failed, where, what never ran, which area is implicated, what evidence is missing, what command reproduces repository-defined verification, whether the same failure is historical, whether the condition recovered.

### 14. Data we do not collect initially

No: full raw logs; secret values; all env-var values; cache contents; artifact binaries; every runner machine identifier; arbitrary action contexts; large external provider payloads. Prefer metadata, identity, timing, result, structure, provenance; fetch heavier data only when explicitly needed.

### 15. V0 product boundary

The first implementation proves: given one repository revision and its GitHub Actions execution, Spark can truthfully reconstruct what was declared, what executed, what is running, what completed, what failed, what was skipped/blocked, what Spark believes the evidence applies to, and what remains unknown. **This proof is delivered as a shadow/derived projection** built on the `RepositoryUnderstanding` substrate from the data the live path already fetches plus new bounded Actions fetches; it does **not** rewire the live `SparkInput`/`SparkEvaluation` path (that cutover stays with RU G6). No frontend redesign, no attention-policy change, no agent integration.

### 16. Re-scope from CI-001 (architectural refinements)

CI-001 (Part III) surfaced five facts that sharpen the plan. They are recorded as explicit refinements R1–R6 and drive the task changes in Part II. None weaken a gate; each makes sequencing or the single-seam principle explicit, and each maps to a new task (new IDs per the task rules) rather than silently broadening an existing one.

- **R1 — Build on the substrate, one seam.** The `RepositoryUnderstanding` observation/claim model already exists in `packages/core` (`EvidenceRunObservation`, `EvidenceAttribution`, `EvidenceExpectation`, `CompletenessAssessment`, a `WORKFLOW_ANALYZER` provenance kind) but is not live, and its evidence observation still conflates lifecycle/outcome. CI/CD process intelligence is realized **on this substrate through the single normalization + projector seam**, not a parallel evaluator. **Consequence:** CI G4 and RU G3 (RU-301…RU-305) are **one coordinated evidence-architecture workstream** (new coordination task CI-004), not two separate rewrites.
- **R2 — Lifecycle/outcome is a core vocabulary change.** The Part I §4 invariant (`lifecycle ≠ outcome`) must be introduced once, at the provider-neutral observation layer, because both RU and CI consume it. The current `EvidenceRunObservation.status` / `EvidenceStatus` is exactly the conflation to replace. **Consequence:** new task CI-106 (core process vocabulary) is a prerequisite for CI-102 and for RU-301.
- **R3 — Choose the canonical GitHub data source.** The live path reads `commits/{sha}/check-runs` (jobs flattened, no steps, no run/attempt). Full process intelligence needs the Actions run/job/step endpoints **and** the check-suite ⇄ run-id crosswalk. **Consequence:** new task CI-207 fixes the canonical source + crosswalk before CI-201–206 are built on it.
- **R4 — V0 is a shadow projection; live cutover is RU G6.** Because the RU substrate is not on the live path, the G0–G5 proof is a derived/shadow reconstruction that leaves the live path, attention policy, and neutral check unchanged (rule 12).
- **R5 — Corpus shapes the shared fixtures.** The CI-002 corpus keeps bounded GitHub response shapes (check runs/suites, Actions runs/jobs/steps, deployments/statuses) separate from the checked-in process declaration, the provider-neutral target truth, and today's legacy projection. CI-106 promotes that target vocabulary into actual core observations; CI-002 does not claim that its fixture-only truth type is already canonical `RepositoryObservations`.
- **R6 — Deployment events must be routed.** CI-001 confirmed `deployment` / `deployment_status` webhooks are received but ignored. G10 needs them routed to the adapter (provider-neutral after routing). **Consequence:** new task CI-1005.

**Sequencing consequence:** CI-1xx (core types incl. CI-106 vocabulary) → CI-2xx (adapter, gated by CI-207) → CI-3xx (declared) → **CI-4xx + RU-3xx together** (evidence architecture) → CI-5xx (graph) → CI-6xx (persistence) → CI-7xx (insights) → CI-8xx (history) → CI-9xx (agent context) → CI-10xx (CD, incl. CI-1005 routing).

### Priority data set

- **P0 (must):** workflow identity, revision, run, attempt, job, step, lifecycle, outcome, timestamps, trigger, job dependencies, declared commands/actions, path filters, matrix identity, environment.
- **P1 (high value):** annotations, required checks/rulesets, deployment status, reusable workflows, runner classification.
- **P2 (defer / on demand):** raw logs, artifact contents, cache contents, deep action inputs, external provider internals.

### First proof-of-value insights

1. Verification is running, not regressing. 2. Exact failing job/step. 3. Failure occurred before application tests. 4. Repository-defined reproduction command. 5. Downstream verification blocked, not failed. 6. Only a specific matrix dimension failed. 7. Same-SHA rerun recovered: flake candidate. 8. Expected verification never appeared. 9. Changed boundary lacks attributed verification. 10. Previous verification failure recovered. If Spark cannot produce these truthfully, do not move to more sophisticated agent intelligence.

### Stacked PR strategy (narrow rollback boundaries)

| PR | Scope |
| --- | --- |
| PR CI-1A | CI-001–003 (loss audit, provider-grounded characterization corpus, revision-aware CI-start confound fix) |
| PR CI-1B | CI-004 + CI-101–106 (core process vocabulary and provider-neutral observation model; no provider runtime) |
| PR CI-2 | CI-207 + CI-201–204 + CI-206 (canonical data source + GitHub runtime execution: runs, attempts, jobs, steps) |
| PR CI-3 | CI-205 + CI-301–306 (workflow-definition understanding and declaration/runtime correlation) |
| PR CI-4 | CI-401–405 **+ RU-301…305** (evidence architecture landed as one coordinated workstream; single normalization/projector seam) |
| PR CI-5 | CI-501–503 (Verification Graph / inspection) |
| PR CI-6 | CI-601–605 (persistence / replay) |
| PR CI-7 | CI-701–711 (deterministic process insights) |
| PR CI-8 | CI-801–805 (historical analytics) |
| PR CI-9 | CI-901–904 (agent context interface) |
| PR CI-10 | CI-1001–1004 (bounded deployment extension) |

Split further whenever acceptance or rollback boundaries differ. **PR CI-4 is the shared CI+RU evidence-architecture seam (R1); its rollback boundary spans both the CI and RU task registers.**

## Part II — Living Action Plan

### Status vocabulary

`BACKLOG` (accepted, not yet eligible) · `READY` (dependencies + acceptance defined) · `IN PROGRESS` (the single active task) · `BLOCKED` (blocker + attempted alternatives recorded) · `DONE` (acceptance evidence inspected and linked) · `DROPPED` (removed, with reason + superseding decision).

### Dynamic task rules

1. Task IDs are stable; never reuse an ID. 2. Keep at most one implementation task `IN PROGRESS`. 3. Add newly discovered provider/process semantics as explicit tasks. 4. Never silently broaden an existing task. 5. Split work when rollback or acceptance boundaries differ. 6. Mark `DONE` only after inspecting evidence. 7. Do not weaken fixtures to accommodate implementation. 8. Preserve failed hypotheses. 9. Unknown workflow behavior must remain unknown. 10. Provider-specific behavior must not silently enter canonical core semantics. 11. CI/CD improvements must not change attention policy this round. 12. Agent steering is out of scope until the process model is proven. 13. If findings contradict Part I, update research + dependencies rather than forcing implementation to match the original design.

### G0 — Characterize existing CI reality

Objective: understand the current pipeline before changing it.

| ID | Status | Task | Depends on | Acceptance evidence |
| --- | --- | --- | --- | --- |
| CI-001 | DONE | Catalogue current CI/evidence ingestion and produce a loss map (`RETAINED` / `DISCARDED` / `CONFLATED` / `UNAVAILABLE`). | — | Part III: end-to-end ingestion traced; loss map produced; CI-start confound quantified from deployed D1. |
| CI-002 | DONE | Create CI process characterization corpus. | CI-001 | 14-scenario corpus at `packages/github/test/fixtures/ci-process-corpus.ts` preserves the actual GitHub response boundaries and run/check-suite/attempt/job/check-run identities, separates deployment from deployment-status data, uses valid reusable-workflow syntax, and records provider-neutral `truth` separately from the current projection. Integrity and projection tests live in `packages/github/test/ci-process-corpus.test.ts`. Promote target vocabulary to `packages/core` at CI-106. |
| CI-003 | DONE | Lock down CI-start confound. | CI-002 | `apps/api/test/change-trajectory.test.ts` proves a new revision with fresh pending verification does not emit `EVIDENCE_BECAME_PENDING`/`EVIDENCE_REGRESSED`, while a same-revision PASSED→PENDING transition remains visible. |
| CI-004 | DONE | Coordinate CI G4 with RU G3 (RU-301…RU-305) as one evidence-architecture workstream; align sequencing + the single normalization/projector seam. | CI-001, CI-106 | CI-4xx/RU-3xx mapping is recorded in Part III §3.6; process observations use the existing `normalizeRepositoryUnderstanding` + compatibility projector path; no parallel evaluator was added. |

**G0 exit:** existing CI behavior and known confounds are reproducible in fixtures.

### G1 — Provider-neutral process observations

Objective: represent CI/CD facts without GitHub-specific semantics.

| ID | Status | Task | Depends on | Acceptance evidence |
| --- | --- | --- | --- | --- |
| CI-101 | DONE | Pipeline definition observation (identity, repository, revision, source, name/path, triggers, filters, jobs). | CI-106 | `PipelineDefinitionObservation` represents triggers, filters, declared jobs/matrices/environments, commands/actions, and reusable-process references without provider concepts. |
| CI-102 | DONE | Pipeline run + attempt observations (optional definition identity, revision, trigger/ref, timestamps, lifecycle, outcome, URL). | CI-101, CI-106 | A logical run spans separately identified attempts; attempt lifecycle and outcome are independent; observed runs survive unavailable declaration acquisition. |
| CI-103 | DONE | Job observation (attempt identity, logical job, display name, dependencies, matrix info, runner class, environment, timestamps, lifecycle, outcome). | CI-102 | `PipelineJobObservation` preserves hierarchy, declared identity, dependencies, matrix dimensions, environment, and result state. |
| CI-104 | DONE | Step observation (identity, job identity, sequence, name, declared command/action reference, timestamps, lifecycle, outcome). | CI-103 | `PipelineStepObservation` preserves ordered steps and optional declared command/action/reusable-process references. |
| CI-105 | DONE | Execution identity invariants. | CI-101–104 | `understanding-observations.test.ts` establishes one logical run with distinct attempts and separately identified job/step/evidence observations; normalizer tests enforce parent references. |
| CI-106 | DONE | Define the provider-neutral process **vocabulary** (lifecycle enum, outcome enum, execution-identity value types) and extend `EvidenceRunObservation` so lifecycle and outcome are independent without breaking the legacy projector. | G0 | Core exports one vocabulary consumed by the GitHub corpus; lifecycle/outcome are independent; the compatibility projector has table-driven coverage for missing, pending, pass, fail, skipped, neutral, not-applicable, cancelled, and unknown states. |

**G1 exit: DONE.** Spark core represents CI/CD process facts without GitHub-specific concepts; hierarchy references and runtime state values normalize deterministically, and compatibility loss is explicit.

### G2 — GitHub Actions runtime adapter

Objective: populate process observations using actual GitHub data.

| ID | Status | Task | Depends on | Acceptance evidence |
| --- | --- | --- | --- | --- |
| CI-207 | DONE | Choose + document the canonical GitHub data source (Actions `runs`/`jobs`/`steps` vs `check-runs`) and the check-suite ⇄ run-id crosswalk; fix bounded fetch limits. | G1 | Written decision + crosswalk in `CI_CD_GITHUB_RUNTIME_SOURCE_DECISION.md`; CI-201–206 build on it; API bounds + pagination documented. |
| CI-201 | DONE | Acquire workflow-run data (workflow, run, attempt, revision, trigger, timestamps, lifecycle, outcome). | CI-207 | Bounded run metadata fetched via `listWorkflowRunsForRevision` + `getWorkflowRunAttempt` and normalized to `PipelineRunObservation`/`PipelineAttemptObservation`; tests cover pagination and attempt identity verification. |
| CI-202 | DONE | Acquire job and step data (run → jobs → steps). | CI-201 | Full run/job/step hierarchy populated via `listWorkflowJobsForAttempt`; `jobObservation` and `stepObservations` normalize to `PipelineJobObservation`/`PipelineStepObservation`; tests cover attempt-specific endpoint, truncation, and completeness reporting. |
| CI-203 | DONE | Normalize lifecycle separately from outcome. | CI-201–202 | `normalizeGitHubProcessState` maps status+conclusion to independent lifecycle/outcome; table-driven tests cover queued, in_progress, completed/success, completed/failure, completed/timed_out, completed/neutral, completed/skipped, completed/cancelled, and unknown. |
| CI-204 | DONE | Correctly represent retries (same-SHA rerun vs new-revision correction). | CI-203 | Same-SHA corpus test preserves one run with FAILED then PASSED attempts; a separate test proves a corrected revision carries a different revision and logical-run identity. |
| CI-206 | DONE | Matrix identity. | CI-202 | Every matrix execution preserved through unique job identity and display name without parsing the name. Structured matrix coordinates deferred to CI-306 declaration correlation. Tests show distinct matrix jobs retain separate IDs and `matrix`/`needs` remain `undefined` (not invented). |

**G2 exit: DONE for bounded runtime facts.** Spark reconstructs GitHub Actions execution hierarchy for a revision: bounded workflow-run discovery, attempt-specific job/step acquisition, independent lifecycle/outcome normalization, same-SHA rerun identity, truthful skipped recording, and distinct matrix execution preservation. It does not call a skipped job “blocked” until G3 supplies a declared dependency edge.

### G3 — Checked-in workflow understanding

Objective: understand what the repository declares should execute.

| ID | Status | Task | Depends on | Acceptance evidence |
| --- | --- | --- | --- | --- |
| CI-301 | DONE | Acquire workflow files at the evaluated revision (never assume default branch). | G2 | `acquireGitHubWorkflowDefinitions` reads tree + workflow content with the evaluated SHA; tests prove no default-branch substitution and cover count/byte/tree bounds. |
| CI-302 | DONE | Parse bounded workflow structure (triggers, branch/path filters, jobs, `needs`, matrix, steps `uses`/`run`, environments). | CI-301 | Bounded YAML parse retains the declared fields with job/step/matrix/alias limits and separate acquisition/semantics completeness. |
| CI-205 | DONE | Job dependency handling (blocked/skipped downstream jobs). | CI-202, CI-302 | Exact declaration-label correlation attaches static `needs`; `blockedByPipelineJobIds` is added only for same-attempt non-successful dependencies when the skipped job has no explicit condition. Outcome remains SKIPPED. |
| CI-303 | DONE | Explicit unresolved semantics (dynamic/external behavior lowers completeness). | CI-302 | Invalid/dynamic/bounded structures, action references, wrappers, and reusable processes emit typed issues and PARTIAL semantics; no execution or expression evaluation occurs. |
| CI-304 | DONE | Repository command references (strong commands vs wrapper scripts). | CI-302 | Declared commands carry `semanticReach: DIRECT | WRAPPER | DYNAMIC`; tests distinguish `pnpm test`, `./scripts/ci.sh`, and expression-bearing commands. |
| CI-305 | DONE | Reusable workflow references. | CI-302 | Job-level reusable-process reference is retained and semantics becomes partial because its implementation is not expanded. |
| CI-306 | BLOCKED | Structured matrix coordinates and `needs` correlation from declaration to runtime jobs. | CI-302 | `needs` correlation is complete, but current Actions runs/jobs and Check Runs contracts expose no structured runtime matrix coordinates; display parsing/log parsing/positional matching were rejected. Blocker and alternatives: `CI_CD_WORKFLOW_DECLARATION_DECISION.md`. |

**G3 exit: DONE with CI-306 explicitly unresolved.** Spark explains what the repository declares and which portions remain unknown. The matrix-coordinate limitation is represented as partial completeness and does not block the evidence architecture from consuming factual runtime/declaration observations.

### G4 — Evidence architecture

Objective: connect process execution with repository meaning. **This gate reconciles with RU-301…RU-305 rather than duplicating them** (see Part III §3.6 for the exact mapping).

| ID | Status | Task | Depends on | Acceptance evidence | Reconciles with |
| --- | --- | --- | --- | --- | --- |
| CI-401 | DONE | Pipeline execution → `EvidenceRunObservation` (execution stays a fact; no coverage implied). | G2, G3 | Runs become provider-neutral evidence-run observations. | RU-301 |
| CI-402 | DONE | Evidence attribution (provenance-bearing claims targeting CHANGE/AREA/BOUNDARY/RELATIONSHIP). | CI-401 | Attribution sources: workflow path filters, supported commands, build/test metadata, repository structure, profile, provider metadata. | RU-303 |
| CI-403 | DONE | Evidence expectations (repository workflow, required-check policy, ecosystem adapter, Spark profile). | CI-402 | No expectation ⇒ no legitimate `MISSING`. | RU-304 |
| CI-404 | DONE | Stale-evidence semantics (revision change creates a new verification subject; old success stays historical). | CI-401 | Prior success is not re-labelled `PENDING`. | RU-302/301 |
| CI-405 | DONE | CI process completeness (separate dimensions: workflow acquisition, runtime acquisition, job acquisition, step acquisition, semantic attribution). | CI-401–403 | Per-dimension completeness, projected to legacy analysis summary. | RU-305 |

**G4 exit: DONE on the bounded shadow path.** Spark answers what ran, what happened, what supported claims say it validates, why, what should have happened, and what remains unknown. The safety boundary is recorded in [`CI_CD_EVIDENCE_ARCHITECTURE_DECISION.md`](./CI_CD_EVIDENCE_ARCHITECTURE_DECISION.md).

### G5 — Verification Graph

Objective: connect change structure to verification process.

| ID | Status | Task | Depends on | Acceptance evidence |
| --- | --- | --- | --- | --- |
| CI-501 | DONE | Define the derived graph projection (`Change → Area → EvidenceExpectation → Job → Step → Result`). | G4 | Bounded projection derived from canonical observations/claims. |
| CI-502 | DONE | Debug/inspection serialization (observations, claims, provenance, completeness, relationships). | CI-501 | Reviewable serialization with explicit truncation, no frontend redesign. |
| CI-503 | DONE | Deterministic output (fixture-stable ordering and identity). | CI-502 | Identity/ordering stable across fixtures. |

**G5 exit: DONE on the bounded shadow path.** A developer can inspect exactly why Spark associates verification with an area or boundary, including canonical IDs, claim provenance, process hierarchy, expectation state, completeness, and truncation. The boundary is recorded in [`CI_CD_VERIFICATION_GRAPH_DECISION.md`](./CI_CD_VERIFICATION_GRAPH_DECISION.md).

### G6 — Persistence and replay

Objective: make CI/CD process intelligence historically trustworthy.

| ID | Status | Task | Depends on | Acceptance evidence |
| --- | --- | --- | --- | --- |
| CI-601 | DONE | Decide persistence boundary (retain run/attempt/job/step summary, revision, timestamps, lifecycle/outcome, claim/version refs; raw logs stay external/on-demand). | G4 | Decision records retained vs external data. |
| CI-602 | DONE | Distinguish event time vs observation time (provider event time, Spark ingestion time, backfill time). | CI-601 | Three time axes represented. |
| CI-603 | DONE | Idempotency (webhook retries do not create duplicate logical executions). | CI-601 | Retry of the same delivery is deduped. |
| CI-604 | DONE | Historical reconstruction (for a revision/time: what had executed, was running, was expected, was missing, and what Spark believed). | CI-601–603 | Point-in-time reconstruction from persisted state. |
| CI-605 | DONE | Exportable process representation (JSONL / Parquet / DuckDB / future analytical systems). | CI-604 | Clean bounded export. |

**G6 exit: DONE on the bounded shadow path.** CI/CD state is point-in-time replayable from bounded, store-agnostic observation records (normalized `RepositoryUnderstanding` payload, three validated time axes, LIVE/BACKFILL source, model/normalization/adapter versions). Ingestion is idempotent at delivery, record, and fact level; reconstruction applies terminal monotonicity and sticky knowledge per exact revision; export is deterministic bounded JSONL. Projections, the verification graph, and later insights stay re-derived — no second store. The boundary is recorded in [`CI_CD_PERSISTENCE_BOUNDARY_DECISION.md`](./CI_CD_PERSISTENCE_BOUNDARY_DECISION.md).

### G7 — Deterministic process insights

Objective: useful intelligence without changing attention. No ML.

| ID | Status | Task | Depends on | Acceptance evidence |
| --- | --- | --- | --- | --- |
| CI-701 | DONE | Normal-CI lifecycle insight (fresh verification after revision change). | G4 | Complete acquisition supports "running, not regressing"; partial acquisition is `UNKNOWN`. |
| CI-702 | DONE | Failure localization (workflow, job, step, annotations, area/boundary where supported). | G4 | Deepest observed failure plus supported attribution and provider URL returned. |
| CI-703 | DONE | Failure-domain classification (SETUP, DEPENDENCY_INSTALL, STATIC_ANALYSIS, BUILD, TEST, INTEGRATION, DEPLOYMENT, UNKNOWN). | CI-702 | Conservative name rules are `HEURISTIC`; unmatched stays `UNKNOWN`. |
| CI-704 | DONE | Reproduction candidates (repository-supported local verification commands). | G3 | Exact checked-in `DIRECT` command + source + caveat; wrappers/dynamic commands excluded. |
| CI-705 | DONE | Blocked downstream verification (why checks did not execute). | G2 | Non-execution explained only by observed failed/skipped/cancelled dependencies. |
| CI-706 | DONE | Matrix-specific result (per-dimension differences preserved). | G2 | Each retained execution carries its full matrix coordinates and result. |
| CI-707 | DONE | Flake candidate (same SHA FAILED → PASSED via rerun). | CI-204 | Same-run/logical-job/matrix retry recovery is `TENTATIVE`, never proof. |
| CI-708 | DONE | Missing expected verification (requires supported expectation). | CI-403 | Emitted only for supported expectations plus complete acquisition. |
| CI-709 | DONE | Verification gaps (changed areas/boundaries without attributed verification). | CI-402 | Complete-acquisition gap identified explicitly as not a failure. |
| CI-710 | BLOCKED | Deployment-state insight (waiting, running, failure, success). | G10 | Non-blocking: deployment/approval observations do not exist until G10. |
| CI-711 | DONE | Recovery insight (previously unresolved condition resolved). | G4 | Two same-revision G6 reconstructions detect failed-job or missing-expectation recovery. |

**G7 exit: DONE on the bounded shadow path.** `process-insights/v1` deterministically derives CI-701–709 from normalized exact-revision state and CI-711 from two G6 reconstructions. Top-level and nested collections are explicitly bounded and report truncation; confidence, source completeness, observation/claim ids, areas, and boundaries remain attached. CI-710 is blocked on G10 rather than guessed. Full verification: 51 test files / 361 tests, TypeScript, and diff checks. No ML, frontend, ingestion, persistence, Check, or attention-policy changes.

### G8 — Historical process intelligence

Objective: use accumulated process history.

| ID | Status | Task | Depends on | Acceptance evidence |
| --- | --- | --- | --- | --- |
| CI-801 | READY | Runtime baselines (median/p90 duration, success/failure/retry rates). | G6 | Denominators present; bounded by history. |
| CI-802 | BACKLOG | Flake evidence (same-revision retry recovery with denominators). | CI-707 | Measured, not asserted. |
| CI-803 | BACKLOG | Failure fingerprints (structured identities first). | G8 | Fingerprint recurrence tracked. |
| CI-804 | BACKLOG | Area/process relationships (which workflows validate which regions). | CI-402 | Area→workflow and boundary→evidence measured. |
| CI-805 | BACKLOG | Process drift (workflow stopped, job slower, new matrix dimension, new dependency, new gap). | G6 | Meaningful drift detected truthfully. |

**G8 exit:** historical insights are statistically bounded and clearly distinguish fact from inference.

### G9 — Agent-facing CI/CD context

Objective: prepare CI/CD intelligence for later steering. **Do not implement automatic steering in this gate.**

| ID | Status | Task | Depends on | Acceptance evidence |
| --- | --- | --- | --- | --- |
| CI-901 | BACKLOG | `ProcessInsightV0` (kind, subject, revision, summary, supporting observations, areas/boundaries, confidence, completeness, reproduction candidate, state ACTIVE/RESOLVED, supersedes/resolvedBy). | G7 | Bounded, provenance-bearing insight shape. |
| CI-902 | BACKLOG | Integrate into future `SteeringStateV0` (one input to general Spark state). | CI-901 | CI/CD state is one input, not a driver. |
| CI-903 | BACKLOG | Shadow usefulness study (can Spark answer: running? failed? where? what never ran? what's missing? recovered?). | CI-901 | Grounded answers measurable in shadow. |
| CI-904 | BACKLOG | Resolution semantics (every actionable insight can become obsolete/resolved). | CI-901 | Obsolescence path defined. |

**G9 exit:** CI/CD intelligence is usable by an agent as structured grounded context without prescribing code changes.

### G10 — Bounded CD extension

Objective: prove the process vocabulary extends beyond CI.

| ID | Status | Task | Depends on | Acceptance evidence |
| --- | --- | --- | --- | --- |
| CI-1001 | BACKLOG | Deployment observations (deployment, revision, environment, lifecycle, outcome, timestamps). | G2 | Deployments modeled with the same vocabulary. |
| CI-1002 | BACKLOG | Waiting/approval state (approval gates distinguished from failures). | CI-1001 | Waiting ≠ failure. |
| CI-1003 | BACKLOG | CI → deployment relationship (observed process links, no implied causality). | CI-1001 | Relationship from observed links only. |
| CI-1004 | BACKLOG | Deployment history (enough for later rollback/outcome research). | CI-1001 | Bounded deployment history retained. |
| CI-1005 | BACKLOG | Route `deployment` / `deployment_status` (and `workflow_run`/`check_suite` where used) webhooks to the adapter (provider-neutral after routing). | CI-1001 | Deployment events stop being silently ignored and reach the adapter. |

**G10 exit:** provider-neutral process semantics survive one bounded CD use case.

## Part III — CI-001 Characterization: current CI/CD ingestion loss map

Evidence: read of `packages/github/src/{webhook,client,evaluate,normalize,check,types,repository}.ts`, `packages/core/src/{types,evaluate,attention,understanding,understanding-projector,analyzers}.ts`, `apps/api/src/{orchestrator,d1,evaluation-detail}.ts`, migrations `0002`/`0004`, `.spark/profile.yml`, and the privacy-safe deployed-D1 aggregate [`CI_CD_PROCESS_INTELLIGENCE_AUDIT.json`](./CI_CD_PROCESS_INTELLIGENCE_AUDIT.json).

### 3.1 Ingestion pipeline (as built)

1. `routeGitHubEvent` (`webhook.ts`) routes only: `installation`, `installation_repositories`, `pull_request` (`opened|reopened|closed` → lifecycle; `synchronize` → evaluate), and `check_run` (`created|rerequested|completed` → evaluate). **Everything else — including `check_suite`, `workflow_run`, `deployment`, `deployment_status` — falls through to `ignore`.** (The exported D1 shows `check_suite` deliveries being received and then ignored.)
2. On evaluate, `buildSparkInputFromPullRequest` (`evaluate.ts`) fetches repository, PR, paged changed files (capped at 30 pages), check runs for the exact SHA via `GET /repos/{owner}/{repo}/commits/{sha}/check-runs` (`listCheckRuns`), and repository context (tree + `package.json` + `pnpm-workspace.yaml`).
3. `normalizeCheckRuns` (`normalize.ts`) maps each `GitHubCheckRun` to `Evidence { name, kind:'check-run', status, source, knowledge:'observed', coverage:'UNKNOWN', url }`.
4. `normalizeCheckStatus` collapses GitHub `status`+`conclusion` into one `EvidenceStatus`: not-completed → `PENDING`; `success` → `PASSED`; `failure|timed_out|action_required|startup_failure` → `FAILED`; otherwise (`neutral|skipped|cancelled|…`) → `UNKNOWN`.
5. `evaluateChange` (core) → `evaluateAttention` (core) consumes only `evidence[].status` and `evidence[].coverage`.
6. Persisted in `evaluation_runs.normalized_json` (a JSON blob) plus a coarse `evidence_health` column (`CLEAR|FAILED|PENDING_OR_MISSING|UNKNOWN`). There is **no dedicated process/evidence table**; evidence exists only inside the blob and the one health enum.

### 3.2 The compressed model (as built)

`revision → check name → single status → source → url → Evidence`. Exactly the model Part I §1 warns against. There is no workflow-run, attempt, job, or step identity in Spark state.

### 3.3 Loss map

**RETAINED** (survives into Spark state):
- check name → `Evidence.name`
- one conflation of status+conclusion → `Evidence.status` (`PENDING|PASSED|FAILED|UNKNOWN`)
- app slug/name → `Evidence.source` (default `github-checks`)
- `knowledge = observed` (constant)
- `coverage = UNKNOWN` (constant — never actually attributed)
- `details_url`/`html_url` → `Evidence.url`
- `head_sha` (the revision, at the `Change` level)
- `app.id` (used only to filter out Spark's own `Spark Observability` check)

**DISCARDED / NOT ACQUIRED** (present in the fetched check-run response but omitted, or available from bounded GitHub endpoints that Spark does not call):
- `check_suite.id` — present in the check-run response but absent from the `GitHubCheckRun` type. It can crosswalk an Actions-owned check to a workflow run whose response carries `check_suite_id`; the workflow identity itself is not contained in the check-run projection.
- all timing: `created_at`, `started_at`, `completed_at`, `performed_at`.
- `check_run.output` title/summary and annotation count/URL; annotation records themselves require a separate annotations endpoint.
- `external_id` from check runs.
- Actions workflow-run, attempt, job, and step data are not acquired. Steps, `runner_id` / `runner_name` / `labels`, and job `run_attempt` come from the Actions workflow-job endpoints, not a check-run steps endpoint.
- matrix coordinates are not a structured field in the workflow-job response; runtime display names must be reconciled conservatively with the checked-in matrix declaration.
- deployment / environment / `deployment_status` data (no endpoint, no event handling).
- reusable-workflow expansion; required-check / branch-protection / ruleset data; concurrency/timeout/permissions from workflow files.
- raw logs (deliberately not collected per Part I §14 — intended).

**CONFLATED** (two distinct things forced into one value/identity):
- **Lifecycle vs outcome** — the single most important conflation. `queued|waiting|in_progress` → `PENDING`; `completed+success` → `PASSED`; `completed+failure` → `FAILED`; `completed+{neutral,skipped,cancelled}` → `UNKNOWN`. "RUNNING", "SKIPPED", "CANCELLED", and "NOT_APPLICABLE" are all indistinguishable from PENDING/UNKNOWN; a completed-but-skipped job cannot be told apart from a queued job.
- **check run vs workflow run vs job vs step** — all reduced to a flat `Evidence[]` keyed by name; the workflow run (check suite) and steps are not separate entities.
- **matrix executions** retain only provider display names. Duplicate names remain ambiguous, and structured coordinates cannot be reconstructed from stored evidence.
- **same-SHA rerun vs new-revision correction** indistinguishable — both are just a fresh `Evidence[]` set; there is no `attempt` identity.
- **execution vs attribution** — `coverage` is always `UNKNOWN`, so "this check passed" is treated as equivalent to "this check validated the changed area"; a pass implies nothing about coverage.
- **missing evidence vs not-expected** — no `EvidenceExpectation` on the live path, so the absence of a check is indistinguishable from "no check was expected" (`.spark/profile.yml` declares `expected_evidence` but nothing consumes it).
- **zero evidence as CLEAR** — `evidenceHealth` returns `CLEAR` when there is no evidence and no FAILED/PENDING/UNKNOWN; absence of evidence is reported as passing.
- **check_suite workflow ignored** — received but routed to `ignore`; workflow-run lifecycle is never tracked.

**UNAVAILABLE** (cannot be reconstructed from what Spark stores today):
- workflow-run identity, attempt number, job/step hierarchy.
- any timing (queue/start/complete/duration).
- which step failed / failure domain (setup vs test).
- failure annotations / file:line / fingerprints.
- which areas/boundaries a check actually validates (attribution).
- which checks were expected (expectation).
- the matrix dimension of a specific result.
- whether a job was blocked by an upstream `needs` dependency.
- deployment/environment state.
- point-in-time process reconstruction (only the latest per-SHA evaluation survives in `evaluations`/`evaluation_details`; the append-only `evaluation_runs` retains the compressed `Evidence[]` but with all the conflations above).

### 3.4 Quantified losses (deployed D1, foundation-2026-08-31; 3,901 evaluation snapshots / 114 PRs / 2 repositories with runs / 20,186 embedded evidence snapshots)

| Signal | Exact result | Implication |
| --- | --- | --- |
| Evidence items **PENDING** | 12,923 / 20,186 = **64.0%** | Pending is common in retained evaluation snapshots, so the confound is material. These are repeated snapshots, not unique CI executions; this rate does not estimate the share of distinct executions that started normally. |
| Evidence coverage **UNKNOWN** | 20,186 / 20,186 = **100%** | Execution is never attributed to any area/boundary. |
| Evidence knowledge | observed 20,186 / 20,186 = 100% | No derived/inferred epistemic distinction anywhere. |
| Evidence statuses | PASSED 7,120 · PENDING 12,923 · FAILED 143 | No SKIPPED/CANCELLED/NEUTRAL category exists — folded into PENDING/UNKNOWN. |
| Runs with **duplicate evidence names** | 127 | Same-name evidence is ambiguous. Stored data cannot attribute the cause to matrices, parallel workflows, or providers. |
| Runs with **same name, conflicting statuses** in one run | 31 | A name is not a stable identity. The stored projection cannot determine the execution relationship that produced the conflict. |
| Runs with **zero evidence** | 379 (all marked `CLEAR`) | Absence of evidence reported as passing. |
| Runs missing/legacy normalized JSON | 25 | Detailed evidence history is unavailable for this legacy tail; the rows are missing JSON rather than invalid JSON. |
| `evidence_health` | CLEAR 651 · FAILED 102 · PENDING_OR_MISSING 3,123 (80%) · UNKNOWN 25 | PENDING_OR_MISSING dominates. |
| Attention | HIGH 700 · MEDIUM 3,168 · LOW 33 | MEDIUM/HIGH co-occurs with the retained evidence states. This aggregate does not isolate Rule 5 from failures, sensitive surfaces, fan-out, or structural uncertainty, so causal attribution is not claimed. |

### 3.5 The CI-start confound, made concrete

`revision A: tests PASSED` → new commit → `revision B:` the same-named check exists only as freshly created/queued check runs → `normalizeCheckStatus` → `PENDING`. Before CI-003, the trajectory engine classified that cross-revision snapshot change as `EVIDENCE_BECAME_PENDING`, which downstream behavior projection treated as `EVIDENCE_WORSE`. CI-003 now uses the already-retained head-SHA axis to avoid that false cross-revision classification while leaving same-revision transitions and attention policy unchanged. The deeper process model is still required because lifecycle and outcome remain conflated and coverage remains unknown. The deployed aggregate shows the risk is material, but its repeated-snapshot grain cannot establish the prevalence of distinct CI-start events.

### 3.6 Reconciliation with the existing Repository Understanding G3 gate

The new `RepositoryUnderstanding` substrate (`packages/core/src/understanding.ts`) already defines the correct *shape*: `EvidenceRunObservation`, `EvidenceAttribution`, `EvidenceExpectation`, `CompletenessAssessment`, and a `RepositoryAnalyzer` interface with a `WORKFLOW_ANALYZER` provenance kind. However:

- At G0, `EvidenceRunObservation` only carried `{ name, evidenceKind, status: EvidenceStatus, source, url }`. CI-106 replaced that conflation with independent lifecycle/outcome and optional attempt/job/step links; CI-101–105 added the provider-neutral hierarchy. Live GitHub ingestion remains legacy until the later adapter/cutover gates.
- `analyzeRepository` / `evaluateUnderstandingCompatibility` exist only in `packages/core` + tests and are **not wired into the live GitHub ingestion path** (confirmed by `AGENT_STEERING_DATA_AND_ARCHITECTURE_INVESTIGATION.md` §4.2). The live path uses the legacy `SparkInput`/`SparkEvaluation` model.
- The `WORKFLOW_ANALYZER` provenance kind is declared but **no workflow analyzer exists**.

So CI-4xx does **not** duplicate RU-301…305; it is the CI/CD-specific realization of them:

| CI task | RU gate task | Relationship |
| --- | --- | --- |
| CI-401 (run → EvidenceRunObservation) | RU-301 (Check Runs → EvidenceRun observations) | extends RU-301 with run/attempt/job/step + lifecycle/outcome |
| CI-302 (bounded workflow parse) | RU-302 (checked-in workflow observation) | same goal; CI-3xx is the CI/CD realization |
| CI-402 (evidence attribution) | RU-303 (evidence-attribution claims) | same claim type, CI/CD-provenance sources |
| CI-403 (evidence expectations) | RU-304 (evidence-expectation claims) | same claim type |
| CI-401/405 (projection + completeness) | RU-305 (project claims to legacy `Evidence`) | keep legacy compatibility during transition |

**Recommendation:** run CI-2xx…CI-4xx and RU-3xx as **one coordinated evidence-architecture workstream** — they share the observation/claim types and the same normalization + projector seam. Splitting them into two independent rewrites of the same seam would be wasteful and risky. The provider-neutral core (CI-1xx / RU-1xx types) and the GitHub adapter (CI-2xx) can proceed on separate rollback boundaries, but the evidence-claim layer (CI-4xx + RU-3xx) should be landed together.

### 3.7 G0 exit status for CI-001

- Current ingestion path traced end-to-end (webhook → client → normalize → evaluate → attention → persist). ✔
- Loss map produced across all four classes (RETAINED / DISCARDED / CONFLATED / UNAVAILABLE). ✔
- CI-start confound quantified from real data (64% PENDING, 100% unknown coverage, 127 duplicate-name runs, 31 conflicting-status runs, 379 zero-evidence-CLEAR runs). ✔
- Reconciliation with RU G3 documented (§3.6). ✔

**G0 is complete:** CI-001's loss map is inspectable, CI-002 makes the provider and projection losses reproducible, and CI-003 prevents the known cross-revision trajectory confound without changing attention policy. G1 subsequently completed the core model; CI-207 is next.

## Task evidence log

Add one row whenever a task changes status. Evidence must point to tests, commands, commits, artifacts, or decisions.

| Date | Task | Transition | Evidence / reason |
| --- | --- | --- | --- |
| 2026-08-31 | CI-001 | created -> done | Loss map (Part III) from reading `packages/github` ingestion + `packages/core` evaluation + `apps/api` persistence; quantified at retained-snapshot grain in `CI_CD_PROCESS_INTELLIGENCE_AUDIT.json`: 12,923/20,186 embedded evidence snapshots PENDING, 20,186/20,186 unknown coverage, 127 evaluation snapshots with duplicate names, 31 with conflicting statuses, and 379 zero-evidence snapshots marked CLEAR. RU reconciliation (§3.6) mapped to RU-301…305. |
| 2026-08-31 | CI-002 | ready (next) | Dependencies met (CI-001 done); acceptance defined (14-scenario corpus, shaped by R5). Immediate next task. |
| 2026-08-31 | CI-002 | ready -> done (superseded) | Initial 14-scenario corpus and 22 projection tests. Later review found incorrect rerun/check-suite identities, invalid reusable-workflow syntax, lifecycle contradictions, conflated deployment/status shapes, and a non-zero root test command; CI-002 was reopened and corrected rather than preserving the initial DONE claim. |
| 2026-08-31 | (plan) re-scope | created (planning) | R1–R6 recorded in Part I §16; new tasks CI-004, CI-106, CI-207, CI-1005 added; CI-102 dependency updated; PR CI-1/2/4 + execution order updated. All grounded in CI-001 (Part III). No fixtures built yet. |
| 2026-09-01 | CI-002 | reopened -> done | Corrected provider boundaries and identity invariants; reruns now keep one run/check-suite identity with distinct attempts/jobs; reusable workflows use job-level `uses`; skipped provider records remain `COMPLETED/SKIPPED`; deployment/status and explicit pending-approval evidence are separate. Corpus tests pass in both root and package execution contexts. |
| 2026-09-01 | CI-003 | backlog -> done | Added revision-aware classification tests and implementation in `apps/api/src/change-trajectory.ts`: fresh PENDING on a new SHA is not `EVIDENCE_BECAME_PENDING`/`EVIDENCE_REGRESSED`; same-SHA PASSED→PENDING remains visible. Attention policy is unchanged. |
| 2026-09-01 | G0 verification | inspected | Root `pnpm test` is explicitly scoped to repository-owned `packages` and `apps`, preventing unrelated untracked analysis applications from being discovered as Spark tests; `pnpm typecheck` remains the workspace-wide type gate. |
| 2026-09-01 | CI-101–106 | backlog/ready -> done | Added provider-neutral definition/run/attempt/job/step observations and independent lifecycle/outcome to `packages/core/src/understanding.ts`; extended normalization with hierarchy/reference checks; added table-driven legacy projection and identity tests; the GitHub corpus now consumes the shared core vocabulary. Focused core/GitHub tests and typecheck pass. |
| 2026-09-01 | CI-004 | backlog -> done | Kept process facts on the existing `RepositoryUnderstanding` normalization + compatibility-projector seam and retained the CI-4xx/RU-3xx coordination mapping in Part III §3.6; no parallel evidence evaluator was introduced. |
| 2026-09-01 | CI-207 | backlog -> ready | G1 dependency is satisfied. Next acceptance boundary is a written, bounded Actions/check-runs source decision and identity crosswalk before provider implementation. |
| 2026-09-01 | CI-207 | ready -> done | Decision written in `CI_CD_GITHUB_RUNTIME_SOURCE_DECISION.md`: GitHub Actions REST is canonical (Actions runs + attempt-specific jobs with embedded steps); Check Runs remain supplemental. Identity crosswalk maps canonical pipeline definition/run/attempt/job/step IDs to provider workflow_id, run.id, (run.id, run_attempt), job.id, and (job.id, step.number). Bounded acquisition defaults documented (1 page × 100 runs, 10 runs, 3 attempts, 1 page × 100 jobs). Normalization decisions fix lifecycle/outcome mapping. Provider limitations (no trustworthy runtime `needs`, no structured matrix coordinates) explicitly deferred to G3 declaration correlation. |
| 2026-09-01 | CI-201–204, CI-206 | backlog -> done | Implemented in `packages/github/src/process.ts` + `packages/github/src/client.ts`: exact-revision runs, historical attempts, attempt-specific jobs with embedded steps, lifecycle/outcome mapping, rerun/new-revision identity, distinct runtime job identity, bounded fetches, and explicit completeness. Focused process/corpus/core tests and typecheck pass. |
| 2026-09-01 | CI-205 | premature done claim -> backlog (moved to G3) | Review found the runtime API proves `SKIPPED` but not the declared `needs` cause. Marking blocked-by-upstream DONE would violate rules 6, 9, and 13. CI-205 now depends on CI-302 and preserves skipped without invented causality until correlation exists. |
| 2026-09-01 | CI-301 | backlog -> ready | G2 dependency is satisfied. Next acceptance boundary: acquire workflow files at the exact evaluated revision SHA (not default branch). |
| 2026-09-01 | CI-306 | created (planning) | CI-207 decision identified a provider limitation: runtime job responses do not provide trustworthy `needs` edges or structured matrix coordinates. CI-306 is the declaration-correlation task that resolves this by correlating declaration-parsed structure to runtime jobs. |
| 2026-09-01 | CI-301–305 + CI-205 | ready/backlog -> done | Added bounded exact-SHA workflow acquisition, YAML declaration parsing, explicit unresolved-semantics issues/completeness, direct/wrapper/dynamic command reach, reusable-process retention, and conservative exact-label runtime correlation with same-attempt blocking references. Full suite: 44 files / 303 tests; typecheck and diff checks pass. |
| 2026-09-01 | CI-306 | backlog -> blocked (non-blocking) | Official workflow-run, attempt-job, and Check Runs contracts expose no structured runtime matrix coordinates. Declared matrices and runtime jobs remain separate; job display parsing, raw logs, and positional matching were rejected as unstable/sensitive. Decision and alternatives recorded in `CI_CD_WORKFLOW_DECLARATION_DECISION.md`. |
| 2026-09-01 | CI-401 | backlog -> ready | Bounded G2/G3 dependencies are satisfied with matrix incompleteness explicit. Next rollback boundary is execution facts becoming evidence observations on the existing shared normalization/projector seam. |
| 2026-09-01 | CI-401 + RU-301 | ready/backlog -> done | `observeGitHubEvidenceRuns` retains exact-revision Check Runs by provider ID, preserves same-name executions, maps independent lifecycle/outcome, and attaches run/attempt/job identities only through the reviewed crosswalk. Spark self-checks and mismatched revisions are not turned into evidence. Full suite: 45 files / 308 tests; typecheck and diff checks pass. |
| 2026-09-01 | CI-404 | backlog -> done | Evidence observations retain their revision, while the compatibility projector selects only evidence for the current change head. Prior success remains in canonical history and is not re-labelled or projected as current evidence. |
| 2026-09-01 | CI-402 | backlog -> ready | Process-linked evidence facts and exact-revision workflow declarations are now available on the single normalization/projector seam. Next boundary is provenance-bearing attribution without implied coverage. |
| 2026-09-01 | CI-402 + RU-303 | ready -> done | Added bounded workflow-evidence claims: exact path-filter rules can target selected artifacts, repository-supported areas, and connected boundaries; explicit adapter/profile rules can target change/area/boundary/relationship. Every claim carries provenance, derivation, evidence references, and completeness. Unfiltered passing checks retain `UNKNOWN` coverage. |
| 2026-09-01 | CI-403 + RU-304 | backlog -> done | Added exact expectation selectors and supported workflow/adapter/profile rule inputs. Conditional, reusable, matrix, dynamic-name, and incomplete jobs do not create missing claims. The projector emits `MISSING` only for supported complete rules after complete exact-revision Check acquisition. |
| 2026-09-01 | CI-405 + RU-305 | backlog -> done | Added independent workflow/runtime/job/step/semantic completeness assessments and bounded Check Run totals/truncation. The existing normalizer and sole compatibility projector retain claims and compress limitations without a second evidence path. Full suite: 46 files / 314 tests; typecheck and diff checks pass. |
| 2026-09-01 | CI-501 | backlog -> ready | G4 shadow evidence architecture is complete with explicit limitations. The next rollback boundary is a bounded graph projection derived only from canonical observations and claims. |
| 2026-09-01 | CI-501 | ready -> done | Added provider-neutral verification graph nodes/edges derived from normalized observations and claims: change/artifact/area/boundary/relationship, expectation, definition/run/attempt/job/step, and result. Unsupported expectations remain `UNKNOWN`; supported unmatched expectations require complete Check acquisition before `NOT_OBSERVED`. |
| 2026-09-01 | CI-502 | backlog -> done | Added versioned developer inspection summaries for observations, claims, provenance, evidence references, completeness, and graph relationships. Defaults bound nodes, edges, per-collection items, supports, and evidence references; every truncation is explicit. No raw logs or frontend contract were added. |
| 2026-09-01 | CI-503 | backlog -> done | Canonical IDs plus fixed node/edge/collection ordering produce byte-stable formatted JSON across reordered equivalent inputs. Tests also establish input immutability, cross-revision link rejection, and deterministic bound behavior. Full suite: 47 files / 320 tests; typecheck and diff checks pass. |
| 2026-09-01 | CI-601 | backlog -> ready | The bounded inspection representation makes the retained-vs-external persistence decision reviewable without prematurely writing process state. |

## Change log

| Date | Change | Reason |
| --- | --- | --- |
| 2026-08-31 | Created CI/CD Process Intelligence living plan; recorded CI-001 DONE. | Convert the research plan into a reversible, evidence-backed implementation register and complete the first characterization task. |
| 2026-08-31 | Re-scoped the plan from CI-001 findings (Part I §16, R1–R6). | Bake in: single CI+RU evidence-claim seam (CI-004); core lifecycle/outcome vocabulary (CI-106); canonical GitHub data source + crosswalk (CI-207); V0 as shadow projection (R4); corpus shapes shared fixtures (R5); deployment webhook routing (CI-1005). No gate weakened; new tasks use new IDs. |
| 2026-08-31 | Completed the initial CI-002 corpus draft. | Preserved as a failed hypothesis in the task evidence log; provider-grounding corrections followed on 2026-09-01. |
| 2026-09-01 | Corrected and revalidated G0; split CI-1 into CI-1A/CI-1B. | Keep characterization/trajectory semantics reviewable before introducing the provider-neutral core model; fix provider identity, lifecycle, deployment, reusable-workflow, and analytical-grain errors found during review. |
| 2026-09-01 | Completed G1 provider-neutral process observations. | Preserve logical run versus rerun-attempt identity, make lifecycle/result independent, share vocabulary with the characterization corpus, and keep legacy behavior behind one explicit lossy projector. |
| 2026-09-01 | Completed the bounded G2 GitHub Actions runtime slice; corrected CI-205 sequencing. | CI-207 fixes canonical source and identity crosswalk; CI-201–204/206 implement bounded factual acquisition. Dependency-blocking interpretation moved behind checked-in declaration correlation because the runtime response cannot establish its cause. Shadow path only. |
| 2026-09-01 | Completed bounded G3 declaration understanding; preserved CI-306 as an explicit provider limitation. | Read workflows at the evaluated SHA, parse only bounded declarations, correlate jobs/needs conservatively, and make unknown external/dynamic/matrix semantics visible rather than heuristic. |
| 2026-09-01 | Started G4 with execution facts and stale-revision isolation. | Convert Check Runs into provider-neutral evidence observations before deriving meaning; preserve historical runs canonically while limiting compatibility output to the evaluated head. |
| 2026-09-01 | Completed bounded G4 evidence architecture. | Keep execution, attribution, and expectation separate; require exact supported selectors and acquisition completeness before `MISSING`; retain per-dimension uncertainty on the shared CI/RU seam. |
| 2026-09-01 | Completed bounded G5 verification graph and inspection. | Make cross-layer associations reviewable without another source of truth; preserve canonical traceability, deterministic identity/order, explicit truncation, and unknown expectation semantics. |

## Decision gates

- **Gate A — Process truth:** can Spark distinguish `running / failed / skipped / blocked / missing / stale / unknown` truthfully? (Core/runtime/declaration model: **yes** for lifecycle/outcome/hierarchy and bounded blocked-dependency correlation. Missing/stale remain G4 evidence/trajectory semantics. Matrix coordinates remain explicitly unknown.) If no, stop.
- **Gate B — Evidence truth:** can Spark distinguish what ran / what passed / what it validates / why / what was expected / what remains unknown? (**Yes on the bounded shadow path**; unsupported/external/dynamic/matrix semantics remain explicitly partial.) If no, stop.
- **Gate C — Historical truth:** can Spark reconstruct CI/CD state at a historical point in time? (Currently **no** — latest-per-SHA projection + compressed blob only.) If no, do not build behavioral analytics.
- **Gate D — Insight usefulness:** can deterministic CI/CD insights explain a change without attention or ML? Reassess the model if no.
- **Gate E — Agent readiness:** can structured CI/CD context reliably answer what an agent needs without prescribing arbitrary code changes? Only after this should CI/CD join automatic-steering research.

**Immediate execution order:** bounded G0–G5 **done** (CI-306 explicitly blocked/non-blocking) → **CI-601 persistence-boundary decision** → CI-602–605 (event/observation time, idempotency, replay, export) → CI-7xx (insights) → CI-8xx (history) → CI-9xx (agent context) → CI-10xx (CD, incl. CI-1005 routing). RU-306 corpus validation may proceed beside the next repository-understanding gate. Do not begin with UI, agent integration, or historical ML.
