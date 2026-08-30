# Repository Understanding Compatibility Map

Status: current behavior baseline for RU-003 and RU-004.

This document identifies consumers that must remain stable while the repository-understanding model changes underneath them. “Preserve” means the consumer continues reading the current representation from the compatibility projector. It does not mean the legacy representation remains canonical internally.

## Canonical producer today

`packages/core/src/evaluate.ts` currently produces `directAreas`, `affectedAreas`, `sensitiveSurfaces`, evidence, analysis metadata, reasons, and attention directly from `RepositoryContext.projects`, path heuristics, and normalized Check Runs. The migration introduces a new canonical understanding model and moves these fields behind one explicit projector.

## Consumer map

| Representation | Current producers | Current consumers | Compatibility requirement | Migration owner/state |
| --- | --- | --- | --- | --- |
| `Project[]` | GitHub JS workspace resolver | Core path matching, downstream graph traversal, normalized evaluation-detail input | Preserve shape through G1; project from supported areas and `depends_on` relationships | Core/GitHub: migrate in G1–G2; storage preserves projected DTO through G5 |
| `directAreas` | Core evaluator | Attention, GitHub Check, CLI, normalized detail, dashboard reader/contracts, PR detail UI, trajectory comparison, tests | Preserve labels, sort order, and deduplication until explicit consumer migration | Core projector owns from G1; all product consumers remain unchanged through G5 |
| `affectedAreas` | Core evaluator and project graph | Attention, GitHub Check, CLI, normalized detail, dashboard reader/contracts, PR detail UI, trajectory comparison, tests | Preserve reverse-dependency results, `Repository-wide`, sort order, and unknown/none presentation | Core projector owns from G1; product consumers remain unchanged through G5 |
| `sensitiveSurfaces` | Path detector plus fan-out rule | Attention, GitHub Check, CLI, normalized detail, dashboard summaries, PR detail, trajectory deltas, change-story logic, tests | Preserve current labels and set semantics even when boundaries become canonical internally | Boundary projector owns from G2; consumers remain unchanged through G5 |
| `Evidence.coverage` | GitHub normalizer (`UNKNOWN`) or explicit core input | Attention coverage rules, GitHub Check annotations, normalized detail, dashboard evidence display, tests | Preserve `string[] | UNKNOWN`; only project explicit attribution that satisfies compatibility policy | Evidence projector owns in G3; consumers remain unchanged through G5 |
| `AnalysisCompleteness` | GitHub input builder | Core incomplete-file escalation, GitHub Check limits, normalized detail, dashboard analysis notes, tests | Preserve changed-file and repository-context summary plus stable notes | Completeness projector owns in G2; persistence and presentation remain unchanged through G5 |
| `reasons` and `attention` | Attention evaluator | GitHub Check, normalized evaluation/run storage, dashboards, trajectory/behavior summaries, CLI, web | No change during G1–G5 except explicitly accepted parity differences | Existing attention evaluator remains owner until RU-603/RU-604 |

## Subsystem migration boundaries

### Core

- Add observations, claims, invariants, and projections.
- Move `Project` and string production behind the compatibility projector.
- Keep the existing attention function consuming projected values until G6.

### GitHub adapter

- Continue acquiring exact-SHA changed files, trees, selected file contents, and Check Runs.
- Refactor workspace discovery into claims during G2.
- Refactor Check Runs into observations during G3.
- Continue constructing compatibility input while the dual path exists.

### GitHub Check and CLI

- Preserve current sections, labels, order, and neutral conclusion.
- Do not consume the new claim model directly in this round.

### Persistence

- Preserve normalized evaluation-detail schema version 1 during shadow validation.
- Do not place an unbounded claim model into the existing 500-item arrays.
- Decide bounded claim persistence in RU-506 and version storage only in RU-602.

### Dashboard contracts and API readers

- Preserve current DTOs and string arrays.
- Continue deriving evidence health from compatibility evidence.
- Avoid schema or frontend changes unless required to prevent breakage.

### Trajectory and behavior analysis

- Preserve area/surface labels as stable set members.
- Do not rename projected labels during the model migration; a rename would appear as a historical removal and addition.
- Any later canonical-ID trajectory requires a separate versioned migration.

### Web

- Preserve current direct-area, affected-area, sensitive-surface, evidence, reason, and analysis-note rendering.
- Use developer-only serialized inspection for shadow validation rather than adding product UI.

## Compatibility risks

1. Label changes create false trajectory deltas.
2. Changing sort order creates noisy snapshots and Check output.
3. Collapsing duplicate Check Runs loses observed executions.
4. Treating attributed evidence as observed coverage changes attention before policy review.
5. Persisting the full model without independent bounds can exceed current normalized-detail assumptions.
6. Replacing `Repository root` in the compatibility output during G2 would mix model validation with product behavior; improved structural claims should first appear in shadow/debug output.

## Migration state vocabulary

- `legacy canonical`: still produced by the current evaluator.
- `projected compatibility`: produced from the new understanding model but consumed through the old contract.
- `dual-path`: current and projected forms are compared for validation.
- `canonical new model`: evaluator consumes the new model; legacy DTO remains at external boundaries only.
- `retired`: no live consumer uses the legacy internal representation.
