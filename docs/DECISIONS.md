# Decision Ledger

This is a living decision and TBD ledger for the Spark project.

## Status Definitions
* **COMMITTED**: Actionable, agreed upon, and in development.
* **WORKING**: Currently being evaluated in code.
* **EXPERIMENT**: Trying out an approach with limited scope.
* **TBD**: Requires a decision before launch.
* **DEFERRED**: Explicitly moved out of the current scope.
* **REJECTED**: Decided against.

---

## Initial Decisions (Dated 2026-08-26)

* **[COMMITTED] V0 is GitHub-native Spark Observability.**
  We will integrate purely via GitHub App first to restrict scope.

* **[COMMITTED] No runtime LLM in V0.**
  Evaluation must be deterministic and explainable for the 72-hour launch. Models may interpret later, but won't run in the critical path right now.

* **[COMMITTED] LOW/MEDIUM/HIGH attention.**
  Three semantic levels of attention. No fake numerical risk scores (e.g., 87/100).

* **[COMMITTED] Observe-only; no enforcement.**
  Spark will report observability data. It will not block merges, auto-revert, or enforce policy in V0.

* **[COMMITTED] JS/TS first for enhanced analysis.**
  We will support generic repo analysis, but we will explicitly build enhanced structural parsing for JS/TS monorepos (pnpm/npm/yarn) to prove the dependency graph concept.

* **[COMMITTED] Zero-config V0.**
  The app must provide value immediately upon installation without requiring a `.spark.yml` file.

* **[DEFERRED] Agent provenance deferred unless verifiable.**
  Tracking which AI agent wrote what code is deferred until we can verify it securely.

* **[COMMITTED] Normalized data retention rather than source-code warehouse.**
  We will store evaluation metadata and relationships, not raw full file diffs or customer source code.

* **[COMMITTED] Free Observe as acquisition/learning layer.**
  The V0 observability product will be free to drive acquisition and build the learning graph.

* **[COMMITTED] Integrate with providers rather than replace everything.**
  We will read CI check runs rather than trying to become the CI provider.

---

## Open TBDs

* **[TBD] Final mission wording.**
  Currently: "Spark makes software changes legible enough to automate with confidence." Needs final approval.
* **[TBD] Exact attention rules.**
  Need to finalize the exact thresholds for fan-out (e.g., what counts as "high" fan-out?).
* **[TBD] Evidence-to-area mapping.**
  How precisely can we map a generic GitHub Check run to a specific affected area in V0?
* **[TBD] Nx/Turbo adapter priority.**
  Decide if these are P1 (in the 72 hours) or strictly V0.1.
* **[TBD] Exact hosting choice.**
  Cloudflare Workers + D1 is preferred, but requires verification of GitHub App webhook compatibility.
* **[TBD] Frontend framework.**
  Need a simple choice for the minimal public site (e.g., plain HTML/CSS, Astro, or simple React).
* **[TBD] Final name/domain.**
  Ensure "Spark" doesn't clash irreparably in search, or acquire the appropriate domain.
* **[TBD] Free-tier limits.**
  What are the usage limits to prevent abuse on the free tier?
* **[TBD] Analytics provider.**
  How do we track the launch success thresholds?
* **[TBD] Payment timing.**
  When and how do we introduce willingness-to-pay gates (e.g., Stripe links)?

* **[COMMITTED] Core Domain Model:**
  Pure TypeScript types representing `Change`, `KnowledgeClass`, `Evidence`, and `SparkEvaluation`. Core engine isolated as a pure function `evaluateChange(input)`.

* **[COMMITTED] Missing Evidence Escalation:**
  If a project is detected as affected (derived) but no corresponding CI evidence is provided, attention escalates to HIGH.

* **[COMMITTED] Repository-wide global fallback:**
  Modifications to CI/CD workflows or global dependency manifests explicitly tag the affected areas as 'Repository-wide', bypassing strict project mapping.

* **[COMMITTED] Evidence Coverage Model:**
  Evidence must explicitly declare the `coverage` of areas it validates, or explicitly state `UNKNOWN`. Substring matching of check names has been removed. Downstream impact without explicit evidence coverage will raise attention truthfully.

* **[COMMITTED] Duplicate Evidence Handling:**
  Duplicate evidence artifacts are intentionally preserved in the array rather than aggressively deduplicated, as they may represent legitimate multi-run statuses or identical names from different sources. The rules engine handles them without cascading errors.

* **[COMMITTED] Empty Change Handling:**
  An empty change strictly outputs LOW attention with the reason 'No changed files observed', short-circuiting standard localized evaluation semantics.

## Phase 2 Decisions (Dated 2026-08-26)

* **[COMMITTED] Cloudflare Worker and D1 for the V0 GitHub loop.**
  The implementation is a thin Worker with four D1 tables. This choice is now verified locally through a successful Wrangler migration.

* **[COMMITTED] Generic GitHub Check evidence has unknown project coverage.**
  Check names are never substring-matched to Spark projects. Generic evidence remains useful and observed, while project coverage is explicitly `UNKNOWN`.

* **[COMMITTED] Observe mode uses a neutral GitHub conclusion.**
  LOW, MEDIUM, and HIGH are rendered in Spark's title and summary. The GitHub Check conclusion is always `neutral`, so Spark V0 cannot accidentally become a merge blocker.

* **[COMMITTED] Exact-SHA Check identity.**
  An evaluation is identified by repository ID plus exact head SHA. A new SHA creates a new Spark Check; evidence changes for the same SHA update its existing Check Run.

* **[COMMITTED] Bounded webhook idempotency.**
  Delivery IDs are claimed atomically in D1 and retained for seven days. Failed processing releases the claim so GitHub can retry.

* **[COMMITTED] Minimal GitHub App permissions.**
  V0 uses Metadata read, Contents read, Pull requests read, and Checks read/write. It subscribes to installation, installation_repositories, pull_request, and check_run only.

* **[DEFERRED] Legacy commit-status ingestion.**
  Phase 2 reads GitHub Check Runs only. Reading legacy commit status contexts would require another permission and another reevaluation event path, so it is deferred until real repository testing demonstrates a need.
