# CI-801–805 — Historical CI/CD intelligence decision

Status: **ACCEPTED** (2026-09-02)

## Question

How may Spark use retained G6 process observations to describe runtime history, retry recovery, recurring failures, target/process relationships, and process drift without double-counting snapshots, fabricating statistical confidence, parsing sensitive logs, or treating incomplete acquisition as negative evidence?

## Decision

Historical intelligence is an **on-demand, bounded reduction of versioned `ProcessObservationRecord` history**. It does not create another store. Records are repository-scoped, deterministically deduplicated by `recordId`, ordered by observation/ingestion time, and limited to the most recent configured history before their normalized payloads are analyzed. Repeated snapshots collapse to provider-stable execution identities.

Every percentage carries its numerator and denominator. Rate values are omitted below the declared minimum denominator (default 5). Duration median/p90 values are omitted below the declared valid-duration sample minimum (default 5). Counts remain available so insufficient history is visible rather than silently discarded.

### CI-801 — Runtime baselines

- Job executions are the outcome/duration grain because retained jobs have lifecycle, outcome, and start/completion timestamps.
- Success, failure, neutral, and skipped rates use terminal job executions as the denominator.
- Duration samples require parseable `startedAt <= completedAt`; exclusions are counted.
- Median uses the conventional midpoint for an even sample, and p90 uses nearest rank.
- Retry rate uses distinct pipeline runs as the denominator and runs with more than one observed attempt as the numerator.
- Repository, pipeline-definition, and definition-qualified logical-job baselines remain separate.

### CI-802 — Flake evidence

An eligible sequence is one exact revision + pipeline run + pipeline definition + logical job + canonical matrix coordinate set with more than one observed attempt. A measured recovery requires an earlier terminal failure and a later completed pass. The report divides recoveries by eligible retry sequences and labels the result `SAME_REVISION_RETRY_RECOVERY`; it explicitly does not prove intrinsic flakiness.

### CI-803 — Failure fingerprints

Fingerprints use the deepest retained structured failure identity: pipeline definition, logical job, failed step name where available, and the conservative G7 failure domain. Stable step/job observation IDs prevent repeated snapshots from increasing recurrence. No log lines, annotation bodies, error-message text, or guessed codes enter the fingerprint. Each fingerprint reports occurrences, the total structured-failure denominator, distinct revisions, first/last observation time, and `OBSERVED_ONCE` vs `RECURRING`.

### CI-804 — Area/process relationships

Only supported, complete deterministic/declared `EvidenceAttribution` claims contribute relationships. Latest known state per revision is used. Relationships retain target identity (area or boundary) and separate evidence-name, pipeline-definition, and definition-qualified logical-job identities. Changed-revision coverage uses only changed revisions with complete Check Run acquisition as the denominator; incomplete revisions are counted as excluded, never as misses.

### CI-805 — Process drift

Drift compares the most recently observed revision with retained prior revision state:

- workflow absence requires complete workflow-file acquisition on both adjacent revisions;
- slower jobs require the same definition + logical job + matrix coordinates and at least the declared number of prior valid durations before comparing current duration with historical p90;
- a new matrix dimension requires prior executions of that definition-qualified logical job;
- a new declared dependency requires prior versions of the same definition/job declaration;
- a new verification gap requires complete evidence acquisition on adjacent revisions and a new G7 `VERIFICATION_GAP` identity.

Coverage records every abstention. “Absent” and “new” are observed transitions, not claims about developer intent or causality.

## Bounds and completeness

Defaults retain at most 10,000 recent records, 500 runtime baselines, 500 retry recoveries, 500 failure fingerprints, 1,000 target/process relationships, and 500 drift signals. Nested fingerprint occurrences, relationship evidence IDs, and drift support IDs are separately bounded. Every exceeded limit adds an explicit collection-level truncation record. Incoherent record envelopes, payload truncation, normalization issues, incomplete acquisitions, and insufficient comparison history remain visible in window/coverage/completeness fields.

## What this does not change

Live ingestion, process persistence, G6 reconstruction, G7 insight semantics, evaluation tables, GitHub Checks, attention policy, frontend behavior, and agent behavior remain unchanged. The output is descriptive historical evidence for later G9 contracts, not a health score or steering policy.

## Retained limitations

- History reflects what Spark retained and observed, not provider truth between observations.
- Job duration is wall-clock provider time and is not decomposed into queueing, runner contention, or external-service causes.
- Structured fingerprints cannot distinguish failures whose retained workflow/job/step identities are identical but whose external log causes differ.
- Drift signals do not infer whether a workflow/dependency/matrix change was intentional.
