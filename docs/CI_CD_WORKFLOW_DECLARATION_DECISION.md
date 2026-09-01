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

## CI-306 provider limitation

The reviewed GitHub Actions workflow-run, attempt-specific jobs, and Check Runs contracts do not expose structured matrix coordinates on runtime jobs. Checked-in declarations expose the matrix axes and values, but GitHub does not document runtime display-name formatting as a stable coordinate mapping. Therefore Spark:

- preserves the declared matrix;
- preserves every runtime execution by provider job ID and display label;
- does not parse labels such as `test (windows, 22)` into coordinates;
- reports runtime matrix correlation as partial/unknown.

Alternatives rejected for V0: raw log parsing (sensitive and unbounded), job-name heuristics (not an authoritative contract), and Cartesian-position matching (order/concurrency/reruns make it unsafe). CI-306 remains blocked on a structured provider source or a separately justified deterministic contract, but this does not prevent G4 from consuming the truthful partial observations.
