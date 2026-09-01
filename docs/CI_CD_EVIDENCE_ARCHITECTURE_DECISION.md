# CI-401–405 / RU-301–305 — Shared evidence architecture

Status: **ACCEPTED AS A BOUNDED SHADOW PROJECTION** (2026-09-01)

Authoritative provider contracts: [GitHub Check Runs REST API](https://docs.github.com/en/rest/checks/runs), [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), and [workflow trigger filters](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushpull_requestpull_request_targetpathspaths-ignore).

## One evidence seam

The CI process adapter contributes to the existing `RepositoryUnderstanding` observation, claim, normalization, and compatibility-projector seam. It does not create a second evaluator or change the live `SparkInput`/attention path.

The three layers remain independent:

1. `EvidenceRunObservation` records that a provider Check Run existed for an exact revision and preserves provider identity, lifecycle/outcome, URL, duplicates, and reviewed process links.
2. `EvidenceAttribution` states what an execution applies to and records why that interpretation is supported.
3. `EvidenceExpectation` states what should have been observed and carries an exact matching selector plus rule provenance.

An execution without attribution remains a truthful execution with `UNKNOWN` coverage. An expectation never fabricates an execution observation.

## Check Run acquisition and identity

Check Runs are read for the evaluated SHA. The bounded client reports provider total, observed count, and truncation; unexpected revisions are omitted and lower completeness. Spark's own Check Run is excluded to prevent self-observation.

Each retained provider Check Run receives a stable ID based on `check_run.id`. Same-name executions remain distinct. Check Suite and Check Run IDs attach optional pipeline run/attempt/job links only when the G2 crosswalk has exactly one match; ambiguous links remain absent and produce a typed issue.

## Attribution boundary

Checked-in path filters support attribution only when the trigger event, required target-branch input, and every used pattern can be evaluated by the bounded matcher. A scoped workflow may then support claims for selected changed artifacts, their repository-supported areas, and connected boundaries. An unfiltered workflow does not imply repository-wide coverage.

Adapters and profiles may supply explicit provenance-bearing rules targeting changes, artifacts, areas, boundaries, or relationships. Adapter rules can require an exact direct checked-in command; wrapper and dynamic commands cannot satisfy that constraint. Repository build/test metadata is retained through the rule's artifact evidence and ecosystem provenance. Rule completeness remains part of claim support. Passing provider evidence by itself never supplies semantic coverage.

## Expectation and `MISSING` boundary

An unconditional, statically named, non-matrix checked-in job may create an expectation when its workflow trigger deterministically applies to the evaluated change. Conditional jobs, reusable workflows, matrix expansions, dynamic names, and structurally incomplete jobs remain unresolved and do not create `MISSING`.

Required-check, adapter, or profile rules can contribute expectations through the same selector and support model. The compatibility projector emits `MISSING` only when:

- at least one declared/deterministic support claim is `SUPPORTED` and `COMPLETE`;
- exact-revision Check Run acquisition is `COMPLETE`; and
- no current-revision execution matches every supplied name/kind/definition/logical-job selector.

Prior-revision evidence stays canonical history but cannot satisfy or appear as evidence for the current head.

## Completeness dimensions

The derived projection retains separate assessments for workflow acquisition, runtime acquisition, job acquisition, step acquisition, and semantic attribution. Semantic completeness incorporates workflow interpretation, runtime/declaration correlation, Check Run acquisition, and typed claim issues. The legacy analysis summary may compress these dimensions, but the canonical model does not.

## Retained limitations

- Structured runtime matrix coordinates remain unavailable under CI-306, so matrix jobs do not create exact missing-execution expectations.
- Dynamic expressions and external actions/reusable workflows are not executed or expanded.
- The bounded path matcher accepts only the documented static subset implemented and tested by Spark; unsupported pattern features remain partial.
- Required-check and profile rules are accepted as explicit inputs here; their provider/profile acquisition belongs to their respective later adapters.
- Live ingestion, attention policy, persistence, frontend behavior, and agent steering remain unchanged.
