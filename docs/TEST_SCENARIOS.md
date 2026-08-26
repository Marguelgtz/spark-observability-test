# Test Scenarios

These deterministic acceptance scenarios must run and pass *before* GitHub integration begins. They define the core behavior of the evaluation engine. Do not rely on an LLM for expected behavior.

### 1. Localized UI change
* **Input**: Modifications only to `apps/web/src/components/Button.tsx`.
* **Relationships**: UI component within the `web` workspace.
* **Evidence**: CI workflows for `web` exist and pass.
* **Expected direct areas**: `apps/web`
* **Expected affected areas**: None
* **Expected attention**: LOW
* **Required explanation**: Routine localized change with passing evidence.

### 2. Shared contract change affecting multiple downstream packages
* **Input**: Modification to `packages/core-types/src/index.ts`.
* **Relationships**: `core-types` is a dependency for `api`, `web`, and `workers`.
* **Evidence**: CI workflows pass for some packages, but coverage is incomplete or unknown for others.
* **Expected direct areas**: `packages/core-types`
* **Expected affected areas**: `apps/api`, `apps/web`, `apps/workers`
* **Expected attention**: HIGH
* **Required explanation**: Change affects shared dependency with moderate downstream fan-out, but downstream validation coverage is incomplete or unknown.

### 3. CI workflow change
* **Input**: Modification to `.github/workflows/deploy.yml`.
* **Relationships**: CI/CD infrastructure.
* **Evidence**: Syntax checker passes.
* **Expected direct areas**: CI/CD
* **Expected affected areas**: Repository-wide
* **Expected attention**: HIGH
* **Required explanation**: Change modifies sensitive CI/CD infrastructure.

### 4. Helm/deployment configuration change
* **Input**: Modification to `k8s/production/deployment.yaml`.
* **Relationships**: Deployment/infrastructure.
* **Evidence**: Linting passes.
* **Expected direct areas**: Infrastructure
* **Expected affected areas**: Production deployment
* **Expected attention**: HIGH
* **Required explanation**: Change modifies sensitive deployment configurations.

### 5. Isolated backend change with complete evidence
* **Input**: Modification to `apps/api/src/utils/format.ts`.
* **Relationships**: Internal to `api`.
* **Evidence**: Unit tests, integration tests, and linting all pass.
* **Expected direct areas**: `apps/api`
* **Expected affected areas**: None
* **Expected attention**: LOW
* **Required explanation**: Routine localized change with robust passing evidence.

### 6. Dependency manifest/lockfile change
* **Input**: Modifications to `package.json` and `pnpm-lock.yaml`.
* **Relationships**: Dependency tree.
* **Evidence**: CI passes.
* **Expected direct areas**: Dependency Management
* **Expected affected areas**: Repository-wide
* **Expected attention**: MEDIUM (or HIGH depending on scope/rules)
* **Required explanation**: Change modifies third-party dependency manifests.

### 7. Failed CI evidence
* **Input**: Modification to `apps/web/src/utils.ts`.
* **Relationships**: Internal to `web`.
* **Evidence**: Linting passes, unit tests FAILED.
* **Expected direct areas**: `apps/web`
* **Expected affected areas**: None
* **Expected attention**: HIGH
* **Required explanation**: Critical evidence (unit tests) failed.

### 8. Unsupported/unknown repo structure
* **Input**: Modification to `src/main.rs` (Rust project, no workspace defined).
* **Relationships**: Unknown/Flat.
* **Evidence**: CI passes.
* **Expected direct areas**: Repository root
* **Expected affected areas**: Unknown
* **Expected attention**: MEDIUM
* **Required explanation**: Structural uncertainty; repository topology could not be deeply analyzed.

### 9. New commit on an already evaluated PR
* **Input**: Same as Scenario 1, but with an additional commit touching `apps/web/src/components/Input.tsx`.
* **Relationships**: UI component.
* **Evidence**: Pending CI.
* **Expected direct areas**: `apps/web`
* **Expected affected areas**: None
* **Expected attention**: MEDIUM
* **Required explanation**: Evidence is missing or currently pending.

### 10. CI evidence transitions from pending to passed
* **Input**: Follow-up to Scenario 9; webhook fires indicating CI passed.
* **Relationships**: UI component.
* **Evidence**: CI passes.
* **Expected direct areas**: `apps/web`
* **Expected affected areas**: None
* **Expected attention**: LOW
* **Required explanation**: Routine localized change with passing evidence.

### 11. Application code and CI definition changed in same PR
* **Input**: Modification to `apps/api/src/routes.ts` AND `.github/workflows/test.yml`.
* **Relationships**: API logic and CI infrastructure.
* **Evidence**: CI passes.
* **Expected direct areas**: `apps/api`, CI/CD
* **Expected affected areas**: Repository-wide
* **Expected attention**: HIGH
* **Required explanation**: Multiple boundaries crossed; sensitive CI infrastructure touched.

### 12. Small diff to a high-fanout shared dependency
* **Input**: 1-line change to `packages/logger/index.ts`.
* **Relationships**: `logger` is imported by 50+ other packages.
* **Evidence**: CI passes.
* **Expected direct areas**: `packages/logger`
* **Expected affected areas**: Massive downstream list (50+ packages)
* **Expected attention**: HIGH
* **Required explanation**: Change affects a dependency with massive downstream fan-out, presenting high structural risk.

## Phase 2 GitHub adapter and API scenarios

The automated suite additionally covers:

* Valid and invalid `X-Hub-Signature-256` verification.
* PR opened and synchronized routing with the exact webhook head SHA.
* Two-page PR-file retrieval and explicit incompleteness at GitHub's 3,000-file limit.
* GitHub file-status normalization.
* Check Run pending, passed, failed, and unknown conclusion normalization.
* Generic Check evidence with explicitly unknown project coverage.
* A derived pnpm workspace dependency and an unsupported-repository fallback.
* A stale webhook SHA rejected when the live PR head has advanced.
* New SHA Check creation and same-SHA Check update after CI completion.
* A neutral GitHub conclusion even when Spark attention is HIGH.
* Duplicate webhook delivery suppression.
* Spark's own Check Run event ignored to prevent recursion.
* GitHub App JWT signing and installation-token exchange with a mocked API.
* Immediate HTTP 202 acknowledgement while orchestration remains unresolved in `waitUntil`.
* Deterministic background-task completion in tests.
* Background failure logging and delivery-claim release for manual redelivery.
* Landing, health, privacy, and terms endpoint responses.

Manual acceptance still required before Phase 2 is complete: install the deployed App on an external test repository, open a real PR, observe the first Spark Check, complete another Check Run, and verify that the same Spark Check is updated.
