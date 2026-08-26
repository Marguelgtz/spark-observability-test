import { createInstallationToken, GitHubApiClient, routeGitHubEvent, verifyWebhookSignature } from '@spark/github';
import { D1SparkStore, type D1Database } from './d1';
import { SparkOrchestrator } from './orchestrator';
import type { SparkStore } from './contracts';
import { landingPage, privacyPage, termsPage } from './pages';

export interface Env {
  // test within file - spark
  DB: D1Database;
  GITHUB_APP_ID: string;
  GITHUB_PRIVATE_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_APP_SLUG?: string;
  SPARK_CONTACT_EMAIL?: string;
}

export interface WebhookDependencies {
  store?: SparkStore;
  orchestrator?: SparkOrchestrator;
}

export interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
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
