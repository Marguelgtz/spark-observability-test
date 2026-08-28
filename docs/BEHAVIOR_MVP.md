# Spark Behavior MVP — Three stacked phases

## Objective

Turn Spark's retained change history into an inspectable deterministic behavior layer without adding proactive guidance, developer/team ranking, opaque prediction, or new persistence.

The MVP should answer three progressively broader questions:

1. **How did this one change behave?**
2. **Which behaviors repeat across changes, and how did those changes end?**
3. **Can a developer inspect those behaviors and examples without reading raw API payloads?**

The behavior layer is downstream of the existing trajectory semantics:

```text
immutable evaluation_runs
        ↓
deriveTransitionDelta
        ↓
classifyNotableTransition
        ↓
behavior boundaries
        ↓
features + motifs + signatures + archetypes
        ↓
pattern aggregation
        ↓
minimal behavior explorer
```

No behavior rule may redefine an existing trajectory transition.

---

## Phase 1 — Behavior projection

**Branch:** `behavior-mvp/1-projection`  
**Base:** `product-experience/4-outcome-intelligence`

### Goal

Derive a versioned `ChangeBehaviorV1` from one existing `PullRequestTrajectoryV1`.

### Behavior boundaries

Multiple notable kinds observed at one evaluation boundary are grouped rather than ordered causally. A canonical boundary can contain:

- `SCOPE_EXPANDED`
- `SENSITIVE_SURFACE_ADDED`
- `EVIDENCE_WORSE`
- `EVIDENCE_BETTER`
- `ATTENTION_UP`
- `ATTENTION_DOWN`

Serialization uses `+` inside one boundary and `>` between boundaries:

```text
v1:SCOPE_EXPANDED+EVIDENCE_WORSE>ATTENTION_UP
```

This means the first two facts were observed at the same run boundary. It does not claim one caused the other.

### Feature vector

Expose inspectable derived facts rather than a score:

- evaluation count;
- notable-boundary count;
- attention increase/decrease counts;
- evidence regression/recovery counts;
- sensitive-surface and scope-expansion counts;
- reached HIGH;
- recovered after HIGH;
- regression followed by recovery;
- attention oscillation;
- observed time at HIGH;
- time to first regression;
- time from first regression to first later recovery.

### Motifs

MVP motifs are deterministic sequence relationships:

- `REGRESSION_THEN_RECOVERY`
- `SCOPE_THEN_REGRESSION`
- `SURFACE_THEN_ATTENTION_UP`
- `ATTENTION_OSCILLATION`

Each occurrence retains start/end timestamps, duration, and transition IDs.

### Archetypes

MVP archetypes are transparent descriptors, not mutually exclusive quality scores:

- `STABLE`
- `DETERIORATING`
- `RECOVERED`
- `OSCILLATING`

Each archetype includes the evidence used to derive it.

### Signatures

- full normalized behavior signature;
- compressed attention-state signature.

All signatures include schema version `v1`.

### Exit gates

- pure derivation from `PullRequestTrajectoryV1`;
- no DB write/migration;
- deterministic ordering and signatures;
- unit coverage for normalization, motifs, timing, archetypes, stable trajectories, and incomplete history;
- workspace typecheck/test/build remain green.

---

## Phase 2 — Recurring pattern aggregation

**Branch:** `behavior-mvp/2-patterns`  
**Base:** `behavior-mvp/1-projection`

### Goal

Aggregate behavior across authorized PRs and connect recurring motifs/signatures to known terminal outcomes.

### Pattern units

Support two deterministic grouping levels:

1. **Motif pattern** — e.g. `SCOPE_THEN_REGRESSION`.
2. **Exact signature pattern** — full normalized behavior signature.

For each pattern expose:

- occurrence count;
- affected PR count;
- outcome counts:
  - resolved before merge;
  - merged unresolved;
  - outcome unavailable;
  - closed without merge;
  - still open;
- bounded representative examples;
- repository-scoped counts where applicable.

Keep both occurrence count and affected PR count. Twelve occurrences across three PRs is different from twelve occurrences across twelve PRs.

### Window semantics

A motif occurrence belongs to a time window when its final event occurs in that window. The reader may load earlier history for the same PR to reconstruct the motif truthfully.

For the MVP, prefer complete retained trajectories for PRs with activity in the selected window rather than persisting a new event index.

### Exit gates

- authorization scope applied before aggregation;
- no developer/team ranking;
- unknown terminal outcomes remain unknown;
- no pattern prediction or recommendation;
- exact example PRs remain inspectable;
- no migration unless derivation is demonstrably too expensive.

---

## Phase 3 — Behavior explorer

**Branch:** `behavior-mvp/3-explorer`  
**Base:** `behavior-mvp/2-patterns`

### Goal

Expose the backend behavior model minimally so Spark can dogfood it.

This phase is not a new analytics product area. It is an inspection surface for validating whether the behavior ontology is useful.

### Minimal API

- one-PR behavior read endpoint;
- aggregate behavior-pattern endpoint with the existing 24h / 7d / 30d and repository scope;
- stable versioned contracts.

### Minimal UI

PR page:

- compact **Behavior** section showing archetypes, feature facts, motifs, and signatures;
- underlying transition/run links remain primary evidence.

Portfolio/repository surface:

- compact **Recurring behaviors** list;
- motif/signature name;
- occurrences and affected PRs;
- known outcome composition;
- representative example links.

Do not add recommendation copy such as “you should” or “consider fixing.”

### Exit gates

- current PR behavior can be inspected in under 30 seconds;
- recurring patterns link back to concrete PR examples;
- incomplete/truncated history is labeled;
- no opaque similarity percentage;
- no synthetic behavior/health score;
- no AI narration;
- desktop/mobile browser acceptance covers the new inspection surfaces.

---

## Explicit MVP non-goals

- proactive guidance;
- developer/team workflow intelligence or ranking;
- fuzzy similarity / embeddings;
- risk prediction;
- synthetic health, behavior, stability, or architecture scores;
- policy/enforcement;
- feedback-driven evaluator behavior;
- deployment/incident correlation in this MVP;
- new persistence unless measurement proves on-read derivation inadequate.

## What comes after the MVP

If the behavior ontology survives dogfooding, the next technical questions are:

- whether recurring motifs are more useful than exact signatures;
- whether timing distributions need first-class aggregation;
- whether behavior facts should be materialized for performance;
- how repository/change-area context changes pattern meaning;
- later, how deployment/rollback/incident outcomes can be attached without overstating causality.
