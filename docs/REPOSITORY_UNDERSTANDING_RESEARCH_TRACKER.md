# Repository Understanding Research Tracker

Status legend: `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED`.

This tracker covers research and technical exploration only. It does not authorize production implementation, migrations, attention retuning, or frontend redesign.

## 1. Current and historical baseline

| Status | Task | Evidence / output |
| --- | --- | --- |
| DONE | Trace the current Spark repository-understanding path | `packages/github/src/repository.ts` emits JS/TS workspace `Project[]`; `packages/core/src/evaluate.ts` maps paths to project-name strings and fallbacks; `attention.ts` escalates structural and evidence uncertainty. |
| DONE | Locate historical profile implementation | Commit `1f478a0` and branch `v0.1/repository-context` load the base-commit profile, validate a proposed head profile, map configured areas, synthesize missing expected evidence, and expose profile context. |
| DONE | Establish the current/historical discrepancy | Profile code was exercised on a parallel branch and never became an ancestor of the current evaluator lineage; separate profile fixture commits remain on the current line. |
| DONE | Inventory repository-native facts available through the GitHub adapter | Current and retrievable-but-unused sources classified in the RFC. |
| DONE | Classify current outputs as facts, claims, projections, or policy decisions | Epistemic map added to the RFC. |

## 2. Research corpus

| Status | Task | Evidence / output |
| --- | --- | --- |
| DONE | Preserve Spark and Stint as known validation cases | Spark current branch recorded; Stint branch `fix/ninfer-ubuntu2404-image` recorded. Stint contains unrelated dirty changes and will remain read-only. |
| DONE | Pin `django/django` and select four representative merged changes | Pin `73cc09f`; PRs #21803, #21749, #21808, and #21746. |
| DONE | Pin `rust-lang/cargo` and select four representative merged changes | Pin `0c507b7`; PRs #17406, #17382, #17385, and #17366. |
| DONE | Pin `kubernetes/kubernetes` and select four representative merged changes | Pin `e72c271`; PRs #141500, #141593, #141658, and #141478. |
| DONE | Pin `bazelbuild/bazel` and select four representative merged changes | Pin `bf49a0e`; PRs #30918, #30666, #30720, and #30656. |
| DONE | Define three controlled synthetic archetypes | Flat service, polyglot monorepo, and disjoint-path functional area recorded in the RFC. |

## 3. Model and evidence probes

| Status | Task | Evidence / output |
| --- | --- | --- |
| DONE | Test the minimal Area/Membership/Relationship/Boundary vocabulary across the corpus | Cross-repository matrix exposes the required observation and split-evidence revisions. |
| DONE | Separate epistemic class, provenance source, and completeness | Separate support axes and examples recorded. |
| DONE | Test overlap, hierarchy, and independent classification views | Spark, Stint, and disjoint-area cases require many-to-many membership; selection remains policy. |
| DONE | Investigate check-to-claim evidence attribution | Workflow semantics, external CI, public Check Runs, and expectation rules compared. |
| DONE | Identify architecture-specific leakage | No ecosystem-specific core field is required after adapters are kept outside the generic vocabulary. |

## 4. Compatibility and viability

| Status | Task | Evidence / output |
| --- | --- | --- |
| DONE | Specify and test the compatibility projection | Legacy field projections and information loss documented against current consumers. |
| DONE | Identify uncertainty-driven attention behavior | Current conflations catalogued without proposing threshold changes. |
| DONE | Compare layered hybrid, expanded Area, and full graph | Layered hybrid retained with explicit observation/evidence revisions. |
| DONE | Apply viability gates | Result: `VIABLE WITH REVISIONS`. |
| DONE | Audit research coverage and evidence strength | Completion and evidence-gap audit recorded in the RFC. |

## 5. Deliverable

| Status | Task | Evidence / output |
| --- | --- | --- |
| DONE | Write the combined research RFC and decision brief | `docs/REPOSITORY_UNDERSTANDING_RESEARCH.md`. |
| DONE | Record decisions, rejected alternatives, deferred policies, and evidence gaps | Final RFC sections included. |
| DONE | Verify that no development plan or substantial frontend work entered scope | Only research documentation and tracking were added. |
