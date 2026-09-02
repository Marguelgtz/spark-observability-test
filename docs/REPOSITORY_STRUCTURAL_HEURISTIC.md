# Generic Structural Region Heuristic

Status: accepted decision for RU-202. This is a conservative repository-native baseline, not package or architecture inference.

The resolver groups changed artifacts only at a small set of structurally supported anchors:

- `apps`, `packages`, `services`, `modules`, `components`, and `plugins` retain one child segment;
- `internal` retains up to two child segments so a path such as Stint's `internal/provider/vast` remains useful;
- `cmd`, `test`, and `tests` retain one child segment;
- `src` and `lib` remain one region so a flat service does not become a collection of invented services;
- a top-level directory with an observed `__init__.py` may retain one subsystem segment; and
- everything else remains in the repository region.

The result is intentionally structural. It does not assert package identity, dependencies, ownership, deployment meaning, test-to-production relationships, or functional names. Ecosystem analyzers and profiles may add those claims independently. The resolver uses changed artifacts for membership support and the snapshot only for bounded marker evidence. Incomplete snapshots lower completeness when the analyzer emits claims; they do not cause the resolver to manufacture additional regions.

The characterization covers Spark workspace-shaped paths, Stint's real `internal/provider/vast` change, a Django ORM/test path pair with an observed Python package marker, and a controlled flat service. Generated and vendor exclusions remain RU-208 so that this decision does not silently absorb a separate false-area policy.
