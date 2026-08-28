# Roadmap

This is a directional roadmap and parking lot. It outlines the sequence of questions we must answer to validate the product. It is **not** a rigid commitment list.

## Current product-experience execution

The current dashboard work is a bounded presentation/legibility sequence on top of the existing deterministic evaluator and trajectory data:

1. **Persistent shell and navigation** — keep context stable across Home → PR → Run.
2. **Action-oriented Home** — surface active changes, attention, recovery, and merge quality.
3. **Composable insight canvases** — pair related visualizations around one product question instead of presenting isolated chart cards.
4. **First-class Change Story** — make each PR read chronologically as initial state → notable transitions → latest state → merge/close outcome, while keeping forensic detail below the primary story.

Phase 4 is intentionally constrained to existing trajectory/lifecycle/feedback data. It should not add evaluator logic, enforcement, RBAC, AI narration, new integrations, or new persistence unless a truthful story cannot be derived from the existing contract.

## V0
**Question: Will people install Spark for change observability?**

This is the current 72-hour sprint.
Focus: Zero-configuration GitHub App, deterministic evaluation, LOW/MEDIUM/HIGH attention signaling, basic CI evidence integration.

## V0.1
**Question: What makes them keep it installed?**

Focus:
* `.spark.yml` configuration
* custom areas
* ignored paths (`.sparkignore`)
* PR history / stacked PR analysis

## V0.2
**Question: Will they customize Spark to represent their system?**

Focus:
* Deeper adapters (Nx, Turbo, Rush)
* External evidence providers (Sentry, Datadog)
* Custom attention rules

## V1
**Question: Will they delegate an actual software-delivery decision/action to Spark?**

Focus:
* Guard/Enforce modes (blocking PRs based on observability)
* Agent provenance (tracking automated vs. human changes)
* Model-assisted semantic interpretation
* Bounded repair agents

---

## Future Candidates (Parking Lot)

* CodeRabbit / Qodo integrations
* Argo / Kubernetes deployment lineage tracking
* Managed LLM inference for deep diff context
* Experiential outcome history (linking production outages to specific PR patterns)
* Contextual autonomy (empowering autonomous agents using Spark's graph)

---

## The Long-Term Graph

The ultimate technical vision is to map the entire software-change lifecycle:

```text
intent
→ actor
→ change
→ review
→ CI
→ policy
→ merge
→ deployment
→ runtime outcome
→ experience
→ future autonomy
```
