# V0 Scope

This document serves as the strict sprint definition of done for the 72-hour V0 launch.

## Launch objective

Deliver a functional, zero-configuration GitHub App that provides deterministic software-change observability on pull requests.

## Activation event

First real Spark evaluation successfully delivered to an external repository via a pull request GitHub Check.

## Retention signal

Second PR evaluation successfully delivered on the same installed repository.

## P0 checklist

This is everything necessary for the complete public install → PR → Spark Check flow:
- [ ] Public GitHub App created and configured
- [ ] Installation flow working (handling `installation` webhooks)
- [x] Webhook signature validation implemented
- [x] PR event handling (`pull_request` opened/synchronize)
- [x] Installation/repository persistence (e.g., in D1)
- [x] Exact head-SHA evaluation mechanism
- [x] Changed-file retrieval via GitHub API
- [x] Generic repository analysis (file extensions, basic directories)
- [x] Enhanced JS/TS monorepo analysis (pnpm workspaces)
- [x] GitHub Check normalization (reading other check runs)
- [x] Sensitive-surface detection (migrations, auth, CI config)
- [ ] Spark Check Run creation/updating
- [x] LOW/MEDIUM/HIGH attention logic with explicit reasons
- [x] Reevaluation when other checks change status
- [ ] Zero-config first run success
- [x] Minimal public landing site / setup instructions
- [x] Core domain tests passing
- [x] Basic operational logging
- [x] Privacy Policy and Terms of Service (required for public launch)

## P1 checklist

Fast-follows if time permits within the 72 hours:
- [ ] Ignored paths configuration (`.sparkignore` or similar)
- [ ] Basic history (evaluating previous PRs)
- [ ] Technology detection (identifying frameworks)
- [ ] Activation analytics tracking
- [ ] Nx adapter for workspace analysis
- [ ] Turbo adapter for workspace analysis
- [ ] Onboarding UI polish

## V0.1+ list

Everything explicitly deferred beyond the 72-hour sprint:
* LLM inference inside Spark
* Custom `.spark.yml` configuration (beyond simple ignores)
* Automated code repair
* Agent transcript storage
* Billing and enterprise RBAC
* Full dashboard UI

## Attention rules

Attention levels are defined semantically:

* **LOW**: Routine change. Highly localized, touches no sensitive surfaces, does not span multiple domain boundaries, and all associated CI evidence is passing.
* **MEDIUM**: Standard change. Touches shared packages, has moderate downstream fan-out, or evidence is still pending. Requires standard developer review.
* **HIGH**: Significant change. Touches critical infrastructure, deployment manifests, database migrations, security/auth surfaces, has massive downstream fan-out, or critical CI evidence has failed. Requires careful, deliberate human attention.

## Launch success thresholds

### Minimum
* 5 external installs
* 3 activated repos
* 10 real evaluations
* 1 meaningful feedback conversation

### Good
* 15 installs
* 10 activated repos
* 30+ evaluations
* 5 repeat users/repos
* 3 substantive conversations
* 1 willingness-to-pay signal

### Strong
* 30+ installs
* 15+ activated repos
* 100+ evaluations
* 5+ repeat users
* 2+ explicit willingness-to-pay signals
