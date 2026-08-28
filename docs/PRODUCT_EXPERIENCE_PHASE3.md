# Product Experience Phase 3 — Key Moments and Change Evolution

**Status:** in progress  
**Branch:** `product-experience/3-change-story`  
**Base:** `product-experience/2b-insight-canvases`

## Product correction

Spark does not yet know enough to truthfully *tell* a software-change story. It has strong immutable observations and deterministic trajectory transitions, but it should not turn those facts into unsupported causal narrative.

This phase therefore treats the PR page as a **story-building substrate**:

```text
observations
    ↓
analytical trajectory
    ↓
forensic detail
    ↓
key moments / change evolution
    ↓
future human / deployment / incident context
```

The UI helps a developer reconstruct what happened without claiming Spark already understands why it happened.

## Objective

Make a pull request's evolution understandable in under 30 seconds while keeping the page closer to the compact, analytical character of the earlier PR view.

A developer should be able to answer:

1. Where did this change start?
2. Which moments materially changed its trajectory?
3. What state is it in now?
4. If it ended, what was the merge or close outcome?
5. Where can I inspect the underlying evidence if I need more detail?

This phase is presentation and deterministic derivation only. It does not change evaluator scoring, persistence, authorization, lifecycle semantics, feedback semantics, or external integrations.

## Primary interaction model

The page should not render every retained moment as a large narrative card. Instead, **Key moments** is a compact chronological spine:

```text
KEY MOMENTS
Material changes Spark observed while this PR evolved

● Initial       LOW      Evidence clear
│
│ 22m
│
● Evidence became incomplete       MEDIUM
│ Integration evidence pending
│
│ 18m
│
● Attention increased to HIGH      HIGH          [feedback]
│ Integration evidence failed · auth/security added
│
│ 5m
│
● Merged        HIGH
  Merged with unresolved attention
```

Each row should prioritize:

- moment type;
- attention/evidence state;
- deterministic headline;
- one or two compact cause fragments;
- elapsed time from the previous retained moment;
- link to the immutable evaluation when available.

The timeline is a **supporting narrative spine** at the bottom of the PR page, after the analytical and forensic views. It should help the user reconstruct the sequence without displacing the primary observability information.

## Terminology

User-facing terminology for this phase:

- **Key moments** — the retained material moments in the PR's evolution.
- **Change evolution** — explanatory copy for what the sequence represents.
- **Change trajectory** — the analytical severity/transition canvas shown earlier on the PR page.

Avoid presenting the primary component as a completed `Change story`. A true story is a future layer that may include human annotations, review decisions, deployments, incidents, or other outcome context.

Internal derivation names may remain unchanged where renaming would add mechanical churn without product value.

## Moment model

The UI continues to derive moments from the existing `PullRequestTrajectoryV1` contract:

1. **Initial** — oldest retained evaluation.
2. **Notable transition** — one moment per deterministic notable transition.
3. **Latest** — newest retained evaluation when it is not already represented by the final transition.
4. **Terminal lifecycle** — merged or closed state, separate from evaluation observations.

Unchanged evaluations remain inspectable in forensic history but are not promoted into the primary sequence.

## Deterministic headline priority

Each material transition gets one primary headline, selected in this order:

1. attention change;
2. evidence regression or resolution;
3. sensitive surface addition;
4. scope expansion.

Secondary causes remain visible as compact supporting facts. The UI does not synthesize unsupported causal claims.

## Terminal outcome copy

Merged PRs use one of these exact outcome labels:

- `Resolved before merge`
- `Merged with unresolved attention`
- `Merge outcome unavailable`

Closed, unmerged PRs use:

- `Closed without merge`

The lifecycle moment continues to expose retained pre-merge attention/evidence facts when available.

## Feedback interaction

Feedback remains attached to the material transition it describes, but it must no longer occupy permanent card space.

Eligible moments expose one compact feedback affordance:

- small icon/button in the moment row;
- tooltip on hover/focus: `Give Spark feedback on this transition`;
- saved feedback uses a subtle selected/saved state;
- activating it opens a **right-side drawer**.

Drawer contents:

1. transition context;
2. `Useful`;
3. `Expected`;
4. `False positive`;
5. `Fixed because of Spark`;
6. optional context textarea;
7. explicit save status;
8. close action and Escape support.

The drawer must preserve existing feedback semantics:

- per viewer;
- per stable transition ID;
- optional;
- measurement-only;
- independent from evaluator behavior.

## Page hierarchy

The primary page order is:

1. PR identity and current state/actions from the existing PR view.
2. Existing **Change trajectory** insight canvas and analytical PR content.
3. **Forensic details** progressive disclosure:
   - observations;
   - evidence issues;
   - complete evaluation history;
   - unchanged evaluations.
4. **Key moments / Change evolution** compact timeline at the bottom of the PR page.

This keeps the PR page analytical first. The compact chronology remains available as a synthesis aid after the user has seen the current state, trajectory, and evidence structure.

## Architecture

Use the existing fields in `PullRequestTrajectoryV1`:

- `runs`
- `notableTransitions`
- `summary`
- `lifecycle`
- `feedback`
- history completeness/truncation metadata

No new contract field or migration is expected.

Implementation boundary:

```text
PullRequestTrajectoryV1
        ↓
pure retained-moment derivation
        ↓
compact key-moments renderer + contextual feedback drawer

PR page composition
        ↓
change-trajectory canvas
        ↓
forensic disclosure
        ↓
key moments / change evolution
```

The derivation module remains DOM-free and unit tested.

## Accessibility

- Key moments remain a semantic ordered sequence.
- Attention/evidence are never encoded by color alone.
- Elapsed-time copy remains readable without the graphical spine.
- Feedback trigger has an explicit accessible name and visible hover/focus tooltip.
- Drawer uses dialog semantics, has an accessible title, supports Escape, restores focus to its trigger, and exposes save status through a live region.
- Terminal outcome has explicit text.
- Mobile preserves chronological order and uses a full-width drawer treatment without horizontal scrolling.

## Exit gates

- initial, notable, latest, and terminal moments render chronologically;
- unchanged evaluations do not clutter the compact sequence;
- key moments render at the bottom of the PR page after trajectory and forensic detail;
- transition headline priority remains deterministic;
- transition causes remain inspectable without dominating the row;
- feedback controls are absent from the resting timeline and available through tooltip + drawer;
- saved feedback can be reopened and edited;
- exact merge/close outcome copy is retained;
- partial/backfilled history is labeled truthfully;
- immutable run navigation remains intact;
- trajectory canvas remains visible without opening forensic details;
- desktop and mobile browser acceptance cover sequence structure, feedback drawer, lifecycle copy, forensic disclosure, and page order;
- typecheck, unit/API tests, production build, D1 migration validation, Worker dry-run, and browser acceptance pass.

## Future story layer

Do not implement this in the current phase, but preserve the product direction:

A future **Story** layer may combine Spark's key moments with human annotations, review decisions, deployment/runtime outcomes, incident links, or carefully bounded generated narration. The current key-moments model should make that future layer possible without pretending it exists today.

## Non-goals

- AI-generated summaries;
- human story annotations in this PR;
- incident/deployment correlation;
- merge enforcement;
- RBAC;
- organization-wide trajectory scoring;
- synthetic trajectory quality scores;
- architecture/modularity claims from evaluation count;
- new lifecycle or feedback persistence.

## Stack

1. `product-experience/1-shell` → `main` (#34)
2. `product-experience/2-home` → `product-experience/1-shell` (#35)
3. `product-experience/2b-insight-canvases` → `product-experience/2-home` (#36)
4. **`product-experience/3-change-story` → `product-experience/2b-insight-canvases`**
