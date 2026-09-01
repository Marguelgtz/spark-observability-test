# CI-301–306 — Checked-in workflow declaration boundary

Status: **ACCEPTED WITH ONE EXPLICIT PROVIDER LIMITATION** (2026-09-01)

Authoritative contracts: [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [GitHub workflow jobs REST API](https://docs.github.com/en/rest/actions/workflow-jobs), and [GitHub Check Runs REST API](https://docs.github.com/en/rest/checks/runs).

## Acquisition boundary

Workflow definitions are repository artifacts and are always read at the evaluated revision:

1. read the recursive repository tree at the exact SHA;
2. select only top-level `.github/workflows/*.yml` and `*.yaml` files;
3. read each selected file through the Contents API with `ref={evaluated_sha}`;
4. parse the retained bytes as declarations, never as runtime truth.

Default bounds:

| Dimension | Limit |
| --- | ---: |
| Workflow files | 50 |
| Bytes per workflow | 256 KiB |
| Total workflow bytes | 1 MiB |
| Jobs per workflow | 100 |
| Steps per job | 100 |
| Static matrix axes | 20 |
| Static values per axis | 100 |
| YAML aliases | 50 |

Tree truncation, unavailable files, invalid YAML, size limits, and declaration limits produce explicit issues and `PARTIAL` completeness. Default-branch workflow content is never substituted for missing exact-revision content.

These bounds are part of Spark's epistemic model, not only request/performance controls. If a provider or repository contains more material than Spark inspected, the canonical observation records that incompleteness. Downstream derivations must therefore distinguish "not observed in the inspected subset" from "does not exist." Conclusions that require exhaustive observation, such as a definitive `MISSING` execution, are not permitted from a partial acquisition.

## Bounded interpretation

The parser retains:

- workflow name/path;
- trigger events plus static branch/path include/exclude filters;
- job IDs/names, static `needs`, raw job condition, static matrix axes, environment name;
- ordered step name/ID and declared `uses` or `run`;
- job-level reusable-workflow references.

It does not evaluate expressions or execute/expand referenced code. Direct commands, wrapper invocations, and dynamic commands are distinguished. Action and reusable-workflow references are retained while semantics completeness becomes partial. Matrix `include`/`exclude`, dynamic matrices, non-scalar axes, and bounded-away declarations remain unresolved rather than being simplified into false certainty.

## Runtime correlation and blocked jobs

Runtime jobs correlate to declarations only when one exact declared job label matches (`jobs.<id>.name`, otherwise the job ID). Prefix, fuzzy, and display-name parsing are prohibited.

A runtime job receives `blockedByPipelineJobIds` only when all of the following hold:

1. it is observed as `COMPLETED/SKIPPED`;
2. it correlates unambiguously to a declaration with static `needs`;
3. the declaration has no explicit job-level `if` condition;
4. a needed job correlates within the same attempt and is failed, cancelled, or skipped.

The job remains `SKIPPED`; blocked-by-upstream is additional causal structure, never rewritten as failure.

## CI-306 provider limitation — structured runtime matrix coordinates

CI-306 is **BLOCKED, NON-BLOCKING**.

### The missing fact

GitHub exposes both sides of a matrix execution, but not the stable structured bridge Spark needs between them:

- the checked-in workflow declaration can say, for example, `matrix: { os: [ubuntu, windows], node: [20, 22] }`;
- the runtime APIs expose four distinct job executions with provider job IDs and human-readable display names;
- the reviewed workflow-run, attempt-specific job, and Check Runs contracts do **not** expose a documented field such as `{ os: "windows", node: 22 }` on each runtime job.

The missing information is therefore not whether a matrix exists and not whether distinct runtime jobs exist. The unresolved information is: **which exact declared matrix coordinate produced each runtime job, according to an authoritative and stable provider contract?**

Example:

```text
Declared matrix
  os:   [ubuntu, windows]
  node: [20, 22]

Observed runtime jobs
  provider-job-101  "test (ubuntu, 20)"
  provider-job-102  "test (ubuntu, 22)"
  provider-job-103  "test (windows, 20)"
  provider-job-104  "test (windows, 22)"
```

A human can infer the mapping from these names. Spark deliberately does not promote that inference to canonical truth because GitHub does not document the display-name format as the identity contract for matrix coordinates, and names can be customized or expression-derived.

### What Spark knows today

Spark can truthfully retain:

- the matrix declaration and its statically understood axes/values;
- the logical declared job that owns the matrix;
- each distinct runtime job execution by provider job ID;
- runtime lifecycle/outcome/timestamps and display label;
- the fact that multiple executions correspond to the matrix-bearing logical job when declaration/runtime correlation is otherwise exact;
- completeness indicating that structured coordinate attribution remains unresolved.

This is enough to say, for example, "three executions passed and one failed" without collapsing them into one result.

### What Spark must not claim today

Without a structured coordinate bridge, Spark must not canonically claim:

- "Windows + Node 22 failed" solely by parsing the display name;
- that a particular declared matrix coordinate never ran;
- that a missing runtime execution corresponds to one specific coordinate;
- coordinate-specific historical reliability or flake rates;
- coordinate-specific evidence expectations or `MISSING` findings;
- coordinate-specific reproduction guidance derived only from the runtime job label.

Those conclusions require the unresolved identity mapping. The limitation therefore affects precision, not the truth of the retained run/job observations.

### Why this does not block G4

G4 consumes factual process observations and supported claims. Matrix runtime jobs still exist as separate observed executions with independent outcomes. Spark can preserve them, attach them to the logical job when supported, and mark coordinate semantics incomplete.

The evidence architecture is specifically designed so an unknown field reduces completeness rather than forcing a guessed value. G4 can therefore answer "what ran and what happened" at job-execution level while declining coordinate-specific assertions.

This limitation also interacts with `MISSING`: absence is only meaningful when Spark knows the expected identity and has complete acquisition. Because Spark cannot form an authoritative exact selector for an individual matrix coordinate, matrix expansions do not currently generate coordinate-level `EvidenceExpectation` records that could later be projected as `MISSING`.

### Alternatives rejected for V0

1. **Parse the runtime display name.** Rejected because display text is not a documented structured identity contract, may be customized, may contain expressions, and could change formatting without an API-versioned semantic change.
2. **Cartesian/positional matching.** Rejected because declaration order does not establish runtime ordering; concurrency, exclusions, includes, retries, cancellations, and provider scheduling break positional assumptions.
3. **Raw log parsing.** Rejected because logs are sensitive, large, unbounded, provider-specific, and still do not provide a sufficiently strong identity contract for canonical observations.
4. **Infer from job count plus matrix declaration.** Rejected because `include`/`exclude`, dynamic matrices, conditions, reusable workflows, and failed expansion can make the runtime cardinality differ from a simple Cartesian product.
5. **Treat a human-readable job name as a permanent identity.** Rejected because names are labels; Spark's execution identity rules require provider/runtime identity to remain separate from presentation text.

These heuristics could be explored later as explicitly lower-confidence derived hints, but they must not silently satisfy CI-306 or become canonical evidence identity.

### What would resolve CI-306

CI-306 can move from `BLOCKED` only when at least one of the following is established and tested:

1. **Provider-supported structured coordinates:** GitHub exposes a documented runtime field/API that maps each job execution to its matrix key/value coordinates.
2. **A separately justified deterministic repository/provider contract:** Spark can derive the mapping from stable structured inputs with documented invariants, without parsing display text, logs, or relying on execution order.
3. **An explicit lower-confidence model is introduced for a different use case:** if future product needs justify heuristic coordinate hints, they must be represented as non-canonical inferred claims with provenance/confidence and must not unlock exact `MISSING`, identity, or historical-statistics semantics. This would not by itself complete CI-306's canonical mapping requirement.

Acceptance evidence for resolution must include fixtures covering at minimum: reordered executions, custom job names, `include`/`exclude`, same-SHA reruns, cancelled/skipped coordinates, and a matrix whose display labels cannot safely be parsed. The mapping must remain deterministic across those cases.

### Revisit triggers

Re-check CI-306 when:

- GitHub changes the workflow jobs or workflow-run API contracts;
- a new Actions endpoint exposes structured matrix metadata;
- Spark adds a provider other than GitHub whose runtime API has first-class matrix coordinates;
- G7/G8 insight work requires coordinate-specific reliability/history and the current limitation becomes materially constraining.

Until one of those conditions supplies stronger evidence, the correct model state is **known matrix declaration + known distinct runtime executions + unknown runtime coordinate mapping**.
