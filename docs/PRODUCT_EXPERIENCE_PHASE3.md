# Product Experience Phase 3 — First-class Change Story

**Status:** in progress  
**Branch:** `product-experience/3-change-story`  
**Base:** `product-experience/2b-insight-canvases`

## Objective

Make a pull request's evolution understandable as one deterministic story rather than a collection of separate forensic sections.

A developer should be able to open a Spark PR page and, in under 30 seconds, answer:

1. Where did this change start?
2. What materially changed while it evolved?
3. What state is it in now?
4. If it ended, what was the merge or close outcome?

This phase is presentation and deterministic derivation only. It does not change evaluator scoring, persistence, authorization, lifecycle semantics, feedback semantics, or external integrations.

## Product shape

The PR page becomes story-first:

```text
PR #1938

Initial
LOW

↓ 2h14m

HIGH
Payments + shared ledger touched
Integration evidence missing

↓ 31m

MEDIUM
Unit evidence recovered
Integration evidence still missing

↓ MERGED

MEDIUM
Merged with unresolved attention
```

The exact visual treatment can differ, but the information hierarchy must remain chronological and scannable.

## Story node model

The UI derives story nodes from the existing `PullRequestTrajectoryV1` contract.

Story nodes are:

1. **Initial** — oldest retained evaluation.
2. **Notable transition** — one node per deterministic notable transition.
3. **Latest** — newest retained evaluation when it is not already represented by the final notable-transition node.
4. **Terminal lifecycle** — merged or closed state, separate from evaluation observations.

Unchanged evaluations remain inspectable in forensic history but are not promoted into the primary story.

## Deterministic headline priority

Each material transition gets one primary headline, selected in this order:

1. attention change;
2. evidence regression or resolution;
3. sensitive surface addition;
4. scope expansion.

Secondary causes remain visible below the headline. The story does not synthesize unsupported causal claims.

## Terminal outcome copy

Merged PRs use one of these exact outcome labels:

- `Resolved before merge`
- `Merged with unresolved attention`
- `Merge outcome unavailable`

Closed, unmerged PRs use:

- `Closed without merge`

The lifecycle node continues to expose the retained pre-merge attention/evidence facts when available.

## Feedback placement

Existing trajectory feedback remains attached to the material transition it describes.

Feedback must not move to a detached page-level section and must remain:

- per viewer;
- per stable transition ID;
- optional;
- measurement-only;
- independent from evaluator behavior.

## Progressive disclosure

The primary page order is:

1. PR identity and current state/action.
2. First-class Change Story.
3. Existing trajectory canvas as a compact analytical summary.
4. Forensic detail below the fold:
   - observations;
   - evidence issues;
   - complete evaluation history;
   - unchanged evaluations.

Forensic detail may be collapsed by default, but no retained evidence or run identity is discarded.

## Data and architecture boundary

Use the existing fields in `PullRequestTrajectoryV1`:

- `runs`
- `notableTransitions`
- `summary`
- `lifecycle`
- `feedback`
- history completeness/truncation metadata

Add a contract field only if the existing data cannot truthfully derive a required story node. No migration is expected.

Implementation boundary:

```text
PullRequestTrajectoryV1
        ↓
pure story derivation
        ↓
change-story UI
        ↓
existing forensic sections
```

The derivation module must be DOM-free and unit tested.

## Accessibility

- Story is a semantic ordered sequence.
- Attention is never encoded by color alone.
- Time-between-state copy remains readable without the graphical connector.
- Terminal outcome has explicit text.
- Feedback controls preserve current keyboard behavior and live save status.
- Mobile keeps chronological order without horizontal scrolling.

## Exit gates

- initial, notable, latest, and terminal nodes render in chronological order;
- unchanged evaluations do not clutter the primary story;
- transition headline priority is deterministic;
- transition causes remain inspectable;
- feedback is rendered on the correct material transition node;
- merged resolved, merged unresolved, unavailable merge outcome, and closed-without-merge states use the exact outcome copy above;
- partial/backfilled history is labeled truthfully;
- existing immutable run navigation remains intact;
- desktop and mobile browser acceptance cover story structure and lifecycle copy;
- typecheck, unit/API tests, production build, D1 migration validation, Worker dry-run, and browser acceptance pass.

## Non-goals

- AI-generated summaries;
- incident/deployment correlation;
- merge enforcement;
- RBAC;
- organization-wide trajectory scoring;
- a synthetic trajectory quality score;
- architecture/modularity claims from evaluation count;
- new lifecycle or feedback persistence.

## Stack

1. `product-experience/1-shell` → `main` (#34)
2. `product-experience/2-home` → `product-experience/1-shell` (#35)
3. `product-experience/2b-insight-canvases` → `product-experience/2-home` (#36)
4. **`product-experience/3-change-story` → `product-experience/2b-insight-canvases`**
