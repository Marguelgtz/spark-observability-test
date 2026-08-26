# Spark - Engineering Agent Contract

This file serves as the persistent engineering-agent contract for the strict 72-hour V0 product sprint.

## Sprint objective

Within 72 hours, an external developer must be able to:

1. Visit Spark.
2. Install a public GitHub App.
3. Select a repository.
4. Open or update a PR.
5. Receive a Spark Observability Check on the PR.
6. Understand:
   * direct changes
   * potentially affected projects/areas
   * existing evidence
   * sensitive surfaces
   * LOW / MEDIUM / HIGH attention
   * transparent reasons

## Product principles

* Observe before automate.
* Evidence must come from verifiable sources.
* Never blur observed facts and inferred relationships.
* Attention must be explainable.
* No fake numerical risk score.
* Prefer deterministic V0 analysis.
* Models may later interpret evidence but may not manufacture it.
* GitHub should be an adapter, not the core domain.
* V0 should work with zero configuration.
* Avoid storing customer source code/full diffs by default.
* Prefer integration with existing tools instead of rebuilding them.
* Keep the long-term vision broad and the V0 implementation narrow.

## V0 required scope

* public GitHub App
* installation flow
* webhook validation
* PR event handling
* installation/repository persistence
* exact head-SHA evaluation
* changed-file retrieval
* generic repository analysis
* enhanced JS/TS monorepo analysis
* project/dependency graph where feasible
* GitHub Check normalization
* sensitive-surface detection
* LOW/MEDIUM/HIGH attention
* explicit reasons
* Spark Check Run
* reevaluation when checks change
* zero-config first run
* minimal public site/setup
* tests
* logging
* privacy/terms before launch

## Explicit V0 exclusions

* LLM inference inside Spark
* agent transcript storage
* automated code repair
* agent execution
* Argo
* Kubernetes
* Sentry
* Datadog
* CodeRabbit
* Qodo
* billing
* enterprise RBAC
* SSO
* semantic code review
* adaptive autonomy
* experiential AI
* full dashboard
* Marketplace dependency
* complex infrastructure

*Note: If an attractive idea is outside this scope, it belongs in `docs/ROADMAP.md`, not in V0.*

## Engineering constraints

* TypeScript end-to-end
* pnpm workspace
* small number of packages
* thin HTTP/API layer
* Cloudflare Workers-compatible backend if practical
* simple relational persistence such as D1
* Vitest
* simple frontend

*No distributed infrastructure without a demonstrated need.*

## Domain boundary

Core evaluation should conceptually support:

```ts
evaluateChange(input): SparkEvaluation
```

Important concepts:
* Repository
* Change
* ChangedFile
* Project
* Area
* Relationship
* Evidence
* AttentionSignal
* SparkEvaluation

*Do not prematurely design a large database schema.*

## Knowledge classes

Spark should distinguish:
* **observed**: Verified facts (e.g., file X was modified)
* **derived**: Logically guaranteed consequences (e.g., package Y depends on package X)
* **inferred**: Probable but unguaranteed consequences (e.g., this affects the user login flow)
* **unknown**: Missing or unavailable information

*Never represent inferred agent provenance as verified.*

## Attention semantics

Use exclusively:
* **LOW**: Routine change, localized impact, evidence passes.
* **MEDIUM**: Standard change, moderate reach, some uncertainty.
* **HIGH**: Broad impact, sensitive surfaces touched, or missing/failing evidence.

Possible signals:
* shared project/package changed
* downstream projects affected
* high dependency fan-out
* CI/CD workflow change
* deployment/infrastructure change
* database migration
* auth/security-sensitive area
* dependency manifest change
* evidence missing
* evidence failed
* structural uncertainty
* multiple boundaries crossed

*Always explain the reason for the attention level.*

## Security invariants

* verify webhook signatures
* installation-scoped GitHub authentication
* minimum permissions
* immutable commit SHA evaluation
* evidence-source tracking
* no token/secret logging
* no source-code storage by default

## Development workflow

**Before GitHub integration:**
1. Define domain behavior.
2. Build fixtures.
3. Make fixture evaluations work.
4. Then integrate GitHub.

**After the first real GitHub Check works:**
1. Stop expanding architecture.
2. Test real repositories.
3. Fix correctness.
4. Fix onboarding.
5. Add only activation/trust-critical work.
