import type {
  ActivityQueryV1,
  ActivityResponseV1,
  EvaluationDetailResponseV1,
  EvaluationDetailV1,
  EvaluationSummaryV1,
  ViewerV1
} from '@spark/dashboard-contracts';

export const FIXTURE_NOW = Date.now();
const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;
const ago = (ms: number) => new Date(FIXTURE_NOW - ms).toISOString();

export const fixtureViewer = {
  version: 1,
  id: 17017482,
  login: 'Marguelgtz',
  avatarUrl: 'https://avatars.githubusercontent.com/u/17017482?v=4'
} satisfies ViewerV1;

const repos = {
  spark: { id: 101, owner: 'acme', name: 'spark', url: 'https://github.com/acme/spark' },
  checkout: { id: 202, owner: 'acme', name: 'checkout', url: 'https://github.com/acme/checkout' },
  web: { id: 303, owner: 'acme', name: 'web', url: 'https://github.com/acme/web' }
} as const;

export const fixtureEvaluations = [
  {
    repository: repos.spark,
    pullRequest: { number: 42, title: 'API authentication changes', url: 'https://github.com/acme/spark/pull/42' },
    headSha: 'a42c11e7b8f2d61f963831db8200deaffeed0042',
    attention: 'HIGH',
    topReasons: ['Authentication/security surface touched', 'Integration evidence failed'],
    changeSummary: { files: 4, additions: 118, deletions: 23, extensions: [{ extension: '.ts', count: 3 }, { extension: '.yml', count: 1 }] },
    sensitiveSurfaces: ['auth/security'],
    evidenceSummary: { passed: 1, pending: 0, failed: 1, missing: 0, unknown: 0 },
    evaluatedAt: ago(8 * minute),
    githubCheckUrl: 'https://github.com/acme/spark/runs/420001',
    detailAvailable: true
  },
  {
    repository: repos.checkout,
    pullRequest: { number: 120, title: 'Checkout integration', url: 'https://github.com/acme/checkout/pull/120' },
    headSha: 'b120b3c98c10d629e6ca4b2d97f20d6500010120',
    attention: 'MEDIUM',
    topReasons: ['Expected verification evidence is missing'],
    changeSummary: { files: 2, additions: 46, deletions: 8, extensions: [{ extension: '.ts', count: 2 }] },
    sensitiveSurfaces: [],
    evidenceSummary: { passed: 1, pending: 0, failed: 0, missing: 1, unknown: 0 },
    evaluatedAt: ago(hour),
    githubCheckUrl: 'https://github.com/acme/checkout/runs/120001',
    detailAvailable: true
  },
  {
    repository: repos.web,
    pullRequest: { number: 81, title: 'Clarify account settings copy', url: 'https://github.com/acme/web/pull/81' },
    headSha: 'c81022d5a4fd823efc3d677e497db49300000081',
    attention: 'LOW',
    topReasons: ['Routine localized change with passing evidence'],
    changeSummary: { files: 1, additions: 8, deletions: 4, extensions: [{ extension: '.tsx', count: 1 }] },
    sensitiveSurfaces: [],
    evidenceSummary: { passed: 2, pending: 0, failed: 0, missing: 0, unknown: 0 },
    evaluatedAt: ago(3 * hour),
    githubCheckUrl: 'https://github.com/acme/web/runs/81001',
    detailAvailable: true
  },
  {
    repository: repos.spark,
    pullRequest: { number: 41, title: 'Update webhook retry path', url: 'https://github.com/acme/spark/pull/41' },
    headSha: 'd410f3a172f50a410e39f20af883f11100000041',
    attention: 'MEDIUM',
    topReasons: ['Verification evidence is pending'],
    changeSummary: { files: 3, additions: 62, deletions: 17, extensions: [{ extension: '.ts', count: 3 }] },
    sensitiveSurfaces: [],
    evidenceSummary: { passed: 1, pending: 1, failed: 0, missing: 0, unknown: 0 },
    evaluatedAt: ago(30 * hour),
    githubCheckUrl: 'https://github.com/acme/spark/runs/41001',
    detailAvailable: true
  },
  {
    repository: repos.checkout,
    pullRequest: { number: 118, title: 'Localize receipt footer', url: 'https://github.com/acme/checkout/pull/118' },
    headSha: 'e1189e85b72f435f4dcc7435617eb99100000118',
    attention: 'LOW',
    topReasons: ['Routine localized change with passing evidence'],
    changeSummary: { files: 2, additions: 12, deletions: 6, extensions: [{ extension: '.json', count: 2 }] },
    sensitiveSurfaces: [],
    evidenceSummary: { passed: 1, pending: 0, failed: 0, missing: 0, unknown: 0 },
    evaluatedAt: ago(3 * day),
    githubCheckUrl: 'https://github.com/acme/checkout/runs/118001',
    detailAvailable: true
  },
  {
    repository: repos.web,
    pullRequest: { number: 79, title: 'Move production deploy workflow', url: 'https://github.com/acme/web/pull/79' },
    headSha: 'f79088b9c183f009305ec0ee56283f1300000079',
    attention: 'HIGH',
    topReasons: ['Sensitive surface touched: CI/CD'],
    changeSummary: { files: 2, additions: 31, deletions: 19, extensions: [{ extension: '.yml', count: 1 }, { extension: '.md', count: 1 }] },
    sensitiveSurfaces: ['CI/CD', 'deployment'],
    evidenceSummary: { passed: 2, pending: 0, failed: 0, missing: 0, unknown: 0 },
    evaluatedAt: ago(10 * day),
    githubCheckUrl: 'https://github.com/acme/web/runs/79001',
    detailAvailable: true
  },
  {
    repository: repos.spark,
    pullRequest: { number: 37, title: 'Initial repository mapping', url: 'https://github.com/acme/spark/pull/37' },
    headSha: 'aa37f103fb3838b5192dd31259b3755700000037',
    attention: 'LOW',
    topReasons: ['Routine localized change with passing evidence'],
    changeSummary: { files: 1, additions: 5, deletions: 0, extensions: [{ extension: '.ts', count: 1 }] },
    sensitiveSurfaces: [],
    evidenceSummary: { passed: 1, pending: 0, failed: 0, missing: 0, unknown: 0 },
    evaluatedAt: ago(20 * day),
    githubCheckUrl: 'https://github.com/acme/spark/runs/37001',
    detailAvailable: false
  },
  {
    repository: repos.checkout,
    pullRequest: { number: 100, title: 'Old dependency refresh', url: 'https://github.com/acme/checkout/pull/100' },
    headSha: 'bb100f1458bdad0c5f72467a90241c0100000100',
    attention: 'MEDIUM',
    topReasons: ['Dependency manifest changed'],
    changeSummary: { files: 2, additions: 90, deletions: 74, extensions: [{ extension: '.json', count: 1 }, { extension: '.yaml', count: 1 }] },
    sensitiveSurfaces: ['dependency manifest'],
    evidenceSummary: { passed: 1, pending: 0, failed: 0, missing: 0, unknown: 0 },
    evaluatedAt: ago(35 * day),
    githubCheckUrl: 'https://github.com/acme/checkout/runs/100001',
    detailAvailable: true
  }
] satisfies EvaluationSummaryV1[];

const detail42 = {
  version: 1,
  repository: repos.spark,
  pullRequest: fixtureEvaluations[0].pullRequest,
  headSha: fixtureEvaluations[0].headSha,
  baseSha: '42baseefbe402758c650f6a1378042ea00000000',
  evaluatedAt: fixtureEvaluations[0].evaluatedAt,
  evaluatorVersion: 'spark-v0.1-fixture',
  attention: 'HIGH',
  reasons: ['Authentication/security surface touched', 'Integration evidence failed'],
  changeSummary: fixtureEvaluations[0].changeSummary,
  changedFiles: [
    { path: 'apps/api/src/auth/session.ts', status: 'modified', additions: 61, deletions: 11 },
    { path: 'apps/api/src/auth/callback.ts', status: 'modified', additions: 34, deletions: 8 },
    { path: 'packages/core/src/security.ts', status: 'added', additions: 23, deletions: 0 },
    { path: '.github/workflows/integration.yml', status: 'modified', additions: 0, deletions: 4 }
  ],
  directAreas: ['api', 'auth'],
  affectedAreas: ['checkout'],
  unmappedPaths: [],
  sensitiveSurfaces: ['auth/security'],
  evidence: [
    { name: 'build', status: 'PASSED', coverage: 'UNKNOWN', url: 'https://github.com/acme/spark/actions/runs/420001' },
    { name: 'integration-test', status: 'FAILED', coverage: ['api'], url: 'https://github.com/acme/spark/actions/runs/420002' }
  ],
  profile: {
    state: 'ACTIVE',
    sourceSha: 'profile42def4560000000000000000000000000000',
    version: 1,
    matchedAreas: [{ id: 'api', criticality: 'high', owners: ['@team-api'], expectedEvidence: ['integration-test'] }]
  },
  analysisNotes: ['Project relationships derived from observed JS/TS workspace manifests'],
  githubCheckUrl: fixtureEvaluations[0].githubCheckUrl
} satisfies EvaluationDetailV1;

const detail120 = {
  version: 1,
  repository: repos.checkout,
  pullRequest: fixtureEvaluations[1].pullRequest,
  headSha: fixtureEvaluations[1].headSha,
  baseSha: '120basec04fa40000000000000000000000000000',
  evaluatedAt: fixtureEvaluations[1].evaluatedAt,
  evaluatorVersion: 'spark-v0.1-fixture',
  attention: 'MEDIUM',
  reasons: ['Expected verification evidence is missing'],
  changeSummary: fixtureEvaluations[1].changeSummary,
  changedFiles: [
    { path: 'payments/charge.ts', status: 'modified', additions: 39, deletions: 8 },
    { path: 'payments/types.ts', status: 'modified', additions: 7, deletions: 0 }
  ],
  directAreas: ['payments'],
  affectedAreas: [],
  unmappedPaths: [],
  sensitiveSurfaces: [],
  evidence: [
    { name: 'unit-test', status: 'PASSED', coverage: 'UNKNOWN', url: 'https://github.com/acme/checkout/actions/runs/120001' },
    { name: 'payment-integration-tests', status: 'MISSING', coverage: ['payments'] }
  ],
  profile: {
    state: 'ACTIVE',
    sourceSha: 'profile120abc0000000000000000000000000000000',
    version: 1,
    matchedAreas: [{ id: 'payments', criticality: 'medium', owners: ['@team-payments'], expectedEvidence: ['payment-integration-tests'] }]
  },
  analysisNotes: [],
  githubCheckUrl: fixtureEvaluations[1].githubCheckUrl
} satisfies EvaluationDetailV1;

const genericDetail = (summary: EvaluationSummaryV1): EvaluationDetailV1 => ({
  version: 1,
  repository: summary.repository,
  pullRequest: summary.pullRequest,
  headSha: summary.headSha,
  baseSha: `base-${summary.headSha.slice(0, 35)}`,
  evaluatedAt: summary.evaluatedAt,
  evaluatorVersion: 'spark-v0.1-fixture',
  attention: summary.attention,
  reasons: summary.topReasons,
  changeSummary: summary.changeSummary,
  changedFiles: [{ path: 'src/example.ts', status: 'modified', additions: summary.changeSummary.additions, deletions: summary.changeSummary.deletions }],
  directAreas: [summary.repository.name],
  affectedAreas: [],
  unmappedPaths: summary.repository.name === 'web' ? ['experiments/copy.ts'] : [],
  sensitiveSurfaces: summary.sensitiveSurfaces,
  evidence: [{ name: 'test', status: summary.evidenceSummary.pending ? 'PENDING' : 'PASSED', coverage: 'UNKNOWN' }],
  profile: { state: 'ABSENT', matchedAreas: [] },
  analysisNotes: summary.repository.name === 'web' ? ['Repository topology is partially unknown'] : [],
  githubCheckUrl: summary.githubCheckUrl
});

const detailByKey = new Map<string, EvaluationDetailV1>([
  [`101:${fixtureEvaluations[0].headSha}`, detail42],
  [`202:${fixtureEvaluations[1].headSha}`, detail120],
  ...fixtureEvaluations.filter((item) => item.detailAvailable && item !== fixtureEvaluations[0] && item !== fixtureEvaluations[1]).map((item) => [`${item.repository.id}:${item.headSha}`, genericDetail(item)] as const)
]);

function windowMs(window: ActivityQueryV1['window']): number {
  if (window === '24h') return day;
  if (window === '7d') return 7 * day;
  return 30 * day;
}

export function buildFixtureActivity(query: ActivityQueryV1, now = FIXTURE_NOW): ActivityResponseV1 {
  const inWindow = fixtureEvaluations.filter((item) => now - Date.parse(item.evaluatedAt) <= windowMs(query.window));
  const observedRepositoryIds = new Set(fixtureEvaluations.map((item) => item.repository.id));
  const repositories = Array.from(observedRepositoryIds).map((id) => {
    const ref = fixtureEvaluations.find((item) => item.repository.id === id)!.repository;
    return { ...ref, evaluationCount: inWindow.filter((item) => item.repository.id === id).length };
  });

  const repositoryScoped = query.repositoryId === null ? inWindow : inWindow.filter((item) => item.repository.id === query.repositoryId);
  const counts = {
    LOW: repositoryScoped.filter((item) => item.attention === 'LOW').length,
    MEDIUM: repositoryScoped.filter((item) => item.attention === 'MEDIUM').length,
    HIGH: repositoryScoped.filter((item) => item.attention === 'HIGH').length
  };

  const attentionScoped = query.attention === 'ALL' ? repositoryScoped : repositoryScoped.filter((item) => item.attention === query.attention);
  const cursorScoped = query.cursor ? attentionScoped.filter((item) => item.evaluatedAt < query.cursor!) : attentionScoped;
  const sorted = [...cursorScoped].sort((a, b) => Date.parse(b.evaluatedAt) - Date.parse(a.evaluatedAt));
  const limit = Math.max(1, Math.min(query.limit ?? 25, 50));
  const evaluations = sorted.slice(0, limit);
  const nextCursor = sorted.length > limit ? evaluations[evaluations.length - 1].evaluatedAt : null;

  return {
    version: 1,
    selectedWindow: query.window,
    selectedAttention: query.attention,
    selectedRepositoryId: query.repositoryId,
    counts,
    repositories,
    evaluations,
    pagination: { nextCursor }
  };
}

export function getFixtureEvaluation(repositoryId: number, headSha: string): EvaluationDetailResponseV1 {
  const summary = fixtureEvaluations.find((item) => item.repository.id === repositoryId && item.headSha === headSha);
  if (!summary) throw new Error('Evaluation not found');
  if (!summary.detailAvailable) return { version: 1, status: 'unavailable', reason: 'LEGACY_RECORD', summary };
  const detail = detailByKey.get(`${repositoryId}:${headSha}`);
  if (!detail) throw new Error('Fixture detail missing');
  return { version: 1, status: 'available', detail };
}
