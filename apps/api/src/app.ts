import type { AccountV1, ActivityQueryV1, ActivityWindowV1, AttentionFilterV1 } from '@spark/dashboard-contracts';
import { createInstallationToken, GitHubApiClient, routeGitHubEvent, verifyWebhookSignature } from '@spark/github';
import type { DashboardAuthorizer, DashboardPrincipal } from './dashboard-access';
import { D1DashboardReader, type DashboardReader } from './dashboard-reader';
import { D1SparkStore, type D1Database } from './d1';
import { GitHubDashboardAuth } from './github-auth';
import { SparkOrchestrator } from './orchestrator';
import type { SparkStore } from './contracts';
import { landingPage, privacyPage, termsPage } from './pages';

export interface Env {
  // test within file - spark
  DB: D1Database;
  GITHUB_APP_ID: string;
  GITHUB_PRIVATE_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_AUTH_CLIENT_ID?: string;
  GITHUB_AUTH_CLIENT_SECRET?: string;
  GITHUB_APP_SLUG?: string;
  SPARK_CONTACT_EMAIL?: string;
  SPARK_PUBLIC_ORIGIN?: string;
}

export interface WebhookDependencies {
  store?: SparkStore;
  orchestrator?: SparkOrchestrator;
  dashboardReader?: DashboardReader;
  dashboardAuthorizer?: DashboardAuthorizer;
  dashboardAuth?: GitHubDashboardAuth;
}

export interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

function account(principal: DashboardPrincipal, env: Env): AccountV1 {
  const installUrl = env.GITHUB_APP_SLUG
    ? `https://github.com/apps/${encodeURIComponent(env.GITHUB_APP_SLUG)}/installations/new`
    : 'https://github.com/settings/installations';
  return {
    version: 1,
    viewer: principal.viewer,
    repositoryCount: principal.repositoryIds.length,
    installationCount: principal.installationIds.length,
    sessionExpiresAt: principal.sessionExpiresAt,
    githubInstallUrl: installUrl,
    githubSettingsUrl: 'https://github.com/settings/installations',
  };
}

function parseActivityQuery(url: URL): ActivityQueryV1 | undefined {
  const windowValue = url.searchParams.get('window') ?? '7d';
  const attentionValue = url.searchParams.get('attention') ?? 'ALL';
  const validWindows: ActivityWindowV1[] = ['24h', '7d', '30d'];
  const validAttention: AttentionFilterV1[] = ['ALL', 'LOW', 'MEDIUM', 'HIGH'];
  if (!validWindows.includes(windowValue as ActivityWindowV1) || !validAttention.includes(attentionValue as AttentionFilterV1)) return undefined;

  const repositoryValue = url.searchParams.get('repositoryId');
  let repositoryId: number | null = null;
  if (repositoryValue) {
    repositoryId = Number(repositoryValue);
    if (!Number.isSafeInteger(repositoryId) || repositoryId <= 0) return undefined;
  }

  const limitValue = url.searchParams.get('limit');
  let limit: number | undefined;
  if (limitValue) {
    limit = Number(limitValue);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) return undefined;
  }

  return {
    window: windowValue as ActivityWindowV1,
    attention: attentionValue as AttentionFilterV1,
    repositoryId,
    cursor: url.searchParams.get('cursor'),
    limit,
  };
}

async function handleDashboardRequest(
  request: Request,
  env: Env,
  dependencies: WebhookDependencies,
): Promise<Response> {
  const url = new URL(request.url);
  const auth = dependencies.dashboardAuth ?? new GitHubDashboardAuth(env);
  const authorizer = dependencies.dashboardAuthorizer ?? auth;
  const principal = await authorizer.authorize(request);
  if (!principal) return json({ error: 'unauthorized' }, 401);

  if (url.pathname === '/api/me') return json(principal.viewer);
  if (url.pathname === '/api/account') return json(account(principal, env));

  const reader = dependencies.dashboardReader ?? new D1DashboardReader(env.DB);
  if (url.pathname === '/api/activity') {
    const query = parseActivityQuery(url);
    if (!query) return json({ error: 'invalid activity query' }, 400);
    if (query.repositoryId !== null && !principal.repositoryIds.includes(query.repositoryId)) {
      return json({ error: 'not found' }, 404);
    }
    return json(await reader.activity(query, principal.repositoryIds));
  }

  const detailMatch = url.pathname.match(/^\/api\/evaluations\/(\d+)\/([^/]+)$/);
  if (detailMatch) {
    const repositoryId = Number(detailMatch[1]);
    const headSha = decodeURIComponent(detailMatch[2]);
    if (!Number.isSafeInteger(repositoryId) || !principal.repositoryIds.includes(repositoryId)) {
      return json({ error: 'not found' }, 404);
    }
    const result = await reader.evaluation(repositoryId, headSha);
    return result ? json(result) : json({ error: 'not found' }, 404);
  }

  return json({ error: 'not found' }, 404);
}

async function processWebhook(
  orchestrator: SparkOrchestrator,
  store: SparkStore,
  routed: ReturnType<typeof routeGitHubEvent>,
  deliveryId: string,
  event: string,
): Promise<void> {
  try {
    const result = await orchestrator.handle(routed);
    console.info(JSON.stringify({ deliveryId, event, action: routed.action, result: result.status }));
  } catch (error) {
    let deliveryReleased = false;
    try {
      await store.releaseDelivery(deliveryId);
      deliveryReleased = true;
    } catch (releaseError) {
      console.error(JSON.stringify({
        deliveryId, event, action: routed.action,
        error: 'delivery release failed', detail: errorMessage(releaseError),
      }));
    }
    console.error(JSON.stringify({
      deliveryId, event, action: routed.action,
      error: errorMessage(error), deliveryReleased,
    }));
  }
}

export async function handleRequest(
  request: Request,
  env: Env,
  context: WorkerExecutionContext,
  dependencies: WebhookDependencies = {},
): Promise<Response> {
  const url = new URL(request.url);
  const publicPageOptions = { appSlug: env.GITHUB_APP_SLUG, contactEmail: env.SPARK_CONTACT_EMAIL };
  if (request.method === 'GET' && url.pathname === '/') return landingPage(publicPageOptions);
  if (request.method === 'GET' && url.pathname === '/health') return json({ status: 'ok' });
  if (request.method === 'GET' && url.pathname === '/privacy') return privacyPage(publicPageOptions);
  if (request.method === 'GET' && url.pathname === '/terms') return termsPage(publicPageOptions);

  const dashboardAuth = dependencies.dashboardAuth ?? new GitHubDashboardAuth(env);
  if (request.method === 'GET' && url.pathname === '/auth/github') return dashboardAuth.start(request);
  if (request.method === 'GET' && url.pathname === '/auth/github/callback') return dashboardAuth.callback(request);
  if (request.method === 'POST' && url.pathname === '/auth/logout') {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json({ error: 'forbidden' }, 403);
    return dashboardAuth.logout(request);
  }

  if (request.method === 'GET' && url.pathname.startsWith('/api/')) {
    return handleDashboardRequest(request, env, { ...dependencies, dashboardAuth });
  }
  if (request.method !== 'POST' || url.pathname !== '/webhooks/github') return json({ error: 'not found' }, 404);

  const body = await request.arrayBuffer();
  const valid = await verifyWebhookSignature(body, request.headers.get('x-hub-signature-256'), env.GITHUB_WEBHOOK_SECRET);
  if (!valid) return json({ error: 'invalid webhook signature' }, 401);
  const deliveryId = request.headers.get('x-github-delivery');
  const event = request.headers.get('x-github-event');
  if (!deliveryId || !event) return json({ error: 'missing GitHub delivery headers' }, 400);
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid JSON payload' }, 400);
  }

  const store = dependencies.store ?? new D1SparkStore(env.DB);
  const claimed = await store.claimDelivery(deliveryId, event);
  if (!claimed) return json({ accepted: true, duplicate: true }, 202);
  const sparkAppId = Number(env.GITHUB_APP_ID);
  const routed = routeGitHubEvent(event, payload, Number.isFinite(sparkAppId) ? sparkAppId : undefined);
  const orchestrator = dependencies.orchestrator ?? new SparkOrchestrator({
    store,
    sparkAppId,
    createClient: async installationId => {
      const token = await createInstallationToken(env.GITHUB_APP_ID, env.GITHUB_PRIVATE_KEY, installationId);
      return new GitHubApiClient(token);
    },
  });
  context.waitUntil(processWebhook(orchestrator, store, routed, deliveryId, event));
  return json({ accepted: true }, 202);
}
