import { describe, expect, it, vi } from 'vitest';
import { routeGitHubEvent, type GitHubApiClient, type GitHubEventRequest, type GitHubRepository } from '@spark/github';
import { handleRequest, type Env, type WorkerExecutionContext } from '../src/app';
import type {
  EvaluationDetailRecord,
  EvaluationObservationRecord,
  EvaluationRecord,
  EvaluationRunRecord,
  PullRequestLifecycleRecord,
  SparkStore,
  StoredEvaluation,
} from '../src/contracts';
import { SparkOrchestrator } from '../src/orchestrator';

class MemoryStore implements SparkStore {
  deliveries = new Set<string>();
  evaluations = new Map<string, StoredEvaluation>();
  details = new Map<string, EvaluationDetailRecord>();
  runs = new Map<string, EvaluationRunRecord>();
  repositories: GitHubRepository[] = [];
  installationEvents: GitHubEventRequest[] = [];
  lifecycleEvents: PullRequestLifecycleRecord[] = [];
  failObservation = false;

  async claimDelivery(id: string): Promise<boolean> {
    if (this.deliveries.has(id)) return false;
    this.deliveries.add(id);
    return true;
  }
  async releaseDelivery(id: string): Promise<void> { this.deliveries.delete(id); }
  async saveInstallationEvent(request: GitHubEventRequest): Promise<void> { this.installationEvents.push(request); }
  async saveRepository(_installationId: number, repository: GitHubRepository): Promise<void> { this.repositories.push(repository); }
  async findEvaluation(repositoryId: number, sha: string): Promise<StoredEvaluation | undefined> { return this.evaluations.get(`${repositoryId}:${sha}`); }
  async saveEvaluation(record: EvaluationRecord): Promise<void> { this.evaluations.set(`${record.repositoryId}:${record.headSha}`, record); }
  async saveEvaluationDetail(record: EvaluationDetailRecord): Promise<void> { this.details.set(`${record.repositoryId}:${record.headSha}`, record); }
  async saveEvaluationObservation(record: EvaluationObservationRecord): Promise<void> {
    if (this.failObservation) throw new Error('synthetic observation persistence failure');
    const duplicate = [...this.runs.values()].some(run => run.idempotencyKey === record.run.idempotencyKey);
    if (!duplicate) this.runs.set(record.run.id, record.run);
    this.evaluations.set(`${record.evaluation.repositoryId}:${record.evaluation.headSha}`, record.evaluation);
    this.details.set(`${record.detail.repositoryId}:${record.detail.headSha}`, record.detail);
  }
  async savePullRequestLifecycle(record: PullRequestLifecycleRecord): Promise<void> { this.lifecycleEvents.push(record); }
}

class TestExecutionContext implements WorkerExecutionContext {
  readonly backgroundTasks: Promise<unknown>[] = [];

  waitUntil(promise: Promise<unknown>): void {
    this.backgroundTasks.push(promise);
  }

  async drain(): Promise<void> {
    await Promise.all(this.backgroundTasks);
  }
}

function fakeClient(
  headSha: string,
  checkStatus: 'queued' | 'completed' = 'queued',
  checkConclusion: 'success' | 'failure' = 'success',
) {
  const created: object[] = [];
  const updated: object[] = [];
  let nextId = 100;
  const client = {
    getRepository: async () => ({ id: 2, full_name: 'acme/repo', default_branch: 'main', owner: { login: 'acme' }, name: 'repo' }),
    getPullRequest: async () => ({
      number: 3,
      title: 'Change repository behavior',
      html_url: 'https://github.com/acme/repo/pull/3',
      state: 'open',
      changed_files: 1,
      head: { sha: headSha },
      base: { sha: 'base' },
    }),
    listPullRequestFiles: async () => ({ files: [{ filename: 'src/main.rs', status: 'modified' }], complete: true }),
    listCheckRuns: async () => [{
      id: 5,
      name: 'CI',
      head_sha: headSha,
      status: checkStatus,
      conclusion: checkStatus === 'completed' ? checkConclusion : null,
      app: { id: 99, slug: 'actions' },
    }],
    getTree: async () => ({ paths: ['src/main.rs'], complete: true }),
    getTextFile: async () => undefined,
    createCheckRun: async (_owner: string, _repo: string, payload: object) => {
      created.push(payload);
      const id = nextId++;
      return { id, name: 'Spark Observability', html_url: `https://github.com/acme/repo/runs/${id}` };
    },
    updateCheckRun: async (_owner: string, _repo: string, id: number, payload: object) => {
      updated.push({ id, payload });
      return { id, name: 'Spark Observability', html_url: `https://github.com/acme/repo/runs/${id}` };
    },
  } as unknown as GitHubApiClient;
  return { client, created, updated };
}

function evaluationRequest(headSha: string, action = 'opened'): GitHubEventRequest {
  return {
    kind: 'evaluate', action, installationId: 1, repositoryId: 2, repositoryFullName: 'acme/repo',
    pullRequestNumber: 3, headSha, payload: {},
  };
}

function trigger(deliveryId: string, event = 'pull_request', action = 'synchronize') {
  return { deliveryId, event, action };
}

async function sign(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return `sha256=${[...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

describe('Spark orchestration', () => {
  it('persists closed lifecycle events without running an evaluation', async () => {
    const store = new MemoryStore();
    const createClient = vi.fn();
    const orchestrator = new SparkOrchestrator({ store, sparkAppId: 42, createClient });
    const request: GitHubEventRequest = {
      kind: 'pull_request_lifecycle',
      action: 'closed',
      installationId: 1,
      repositoryId: 2,
      repositoryFullName: 'acme/repo',
      pullRequestNumber: 3,
      headSha: 'sha-1',
      lifecycle: {
        state: 'MERGED',
        openedAt: '2026-08-28T09:00:00.000Z',
        closedAt: '2026-08-28T10:00:00.000Z',
        mergedAt: '2026-08-28T10:00:00.000Z',
        mergeSha: 'merge-sha',
        occurredAt: '2026-08-28T10:00:00.000Z',
        evaluate: false,
      },
      payload: {},
    };

    await expect(orchestrator.handle(request, trigger('merge-delivery', 'pull_request', 'closed'))).resolves.toEqual({ status: 'stored' });
    expect(store.lifecycleEvents).toEqual([expect.objectContaining({
      state: 'MERGED', mergedAt: '2026-08-28T10:00:00.000Z', mergeSha: 'merge-sha',
    })]);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('persists opened lifecycle state and retains the initial evaluation', async () => {
    const store = new MemoryStore();
    const fake = fakeClient('sha-1');
    const orchestrator = new SparkOrchestrator({ store, sparkAppId: 42, createClient: async () => fake.client });
    const request = routeGitHubEvent('pull_request', {
      action: 'opened',
      installation: { id: 1 },
      repository: { id: 2, full_name: 'acme/repo' },
      pull_request: {
        number: 3,
        head: { sha: 'sha-1' },
        merged: false,
        created_at: '2026-08-28T09:00:00.000Z',
        updated_at: '2026-08-28T09:00:00.000Z',
      },
    });

    const result = await orchestrator.handle(request, trigger('opened-delivery', 'pull_request', 'opened'));

    expect(result.status).toBe('evaluated');
    expect(store.lifecycleEvents).toEqual([expect.objectContaining({ state: 'OPEN', openedAt: '2026-08-28T09:00:00.000Z' })]);
    expect(store.runs.size).toBe(1);
  });

  it('retains same-SHA pending, failed, and passed observations while advancing the current projection', async () => {
    const store = new MemoryStore();
    const pending = fakeClient('sha-1', 'queued');
    let current = pending;
    const orchestrator = new SparkOrchestrator({ store, sparkAppId: 42, createClient: async () => current.client });

    const opened = await orchestrator.handle(evaluationRequest('sha-1'), trigger('delivery-1', 'pull_request', 'opened'));
    expect(opened.status).toBe('evaluated');
    expect(opened.evaluation?.evidence[0].status).toBe('PENDING');
    expect(pending.created[0]).toMatchObject({ head_sha: 'sha-1', conclusion: 'neutral' });

    current = fakeClient('sha-1', 'completed', 'failure');
    const completedPayload = {
      action: 'completed', installation: { id: 1 }, repository: { id: 2, full_name: 'acme/repo' },
      check_run: { name: 'CI', head_sha: 'sha-1', app: { id: 99 }, pull_requests: [{ number: 3 }] },
    };
    const completed = routeGitHubEvent('check_run', completedPayload, 42);
    const failed = await orchestrator.handle(completed, trigger('delivery-2', 'check_run', 'completed'));
    expect(failed.evaluation?.evidence[0].status).toBe('FAILED');
    expect(current.updated).toHaveLength(1);

    current = fakeClient('sha-1', 'completed', 'success');
    const passed = await orchestrator.handle(completed, trigger('delivery-3', 'check_run', 'completed'));

    expect(passed.evaluation?.evidence[0].status).toBe('PASSED');
    expect(current.updated).toHaveLength(1);
    expect(current.updated[0]).toMatchObject({ id: 100 });
    expect(store.evaluations.size).toBe(1);
    expect(store.details.size).toBe(1);
    expect(store.details.get('2:sha-1')?.normalized.evaluation.evidence[0].status).toBe('PASSED');
    expect(store.runs.size).toBe(3);
    const shaRuns = [...store.runs.values()].filter(run => run.headSha === 'sha-1');
    expect(shaRuns).toHaveLength(3);
    expect(shaRuns.map(run => run.normalized?.evaluation.evidence[0].status)).toEqual(['PENDING', 'FAILED', 'PASSED']);
    expect(shaRuns.map(run => run.trigger.deliveryId)).toEqual(['delivery-1', 'delivery-2', 'delivery-3']);
  });

  it('does not append a second run for the same durable idempotency key', async () => {
    const store = new MemoryStore();
    const fake = fakeClient('sha');
    const orchestrator = new SparkOrchestrator({ store, sparkAppId: 42, createClient: async () => fake.client });
    const request = evaluationRequest('sha');
    const sourceTrigger = trigger('same-delivery', 'pull_request', 'opened');

    await orchestrator.handle(request, sourceTrigger);
    await orchestrator.handle(request, sourceTrigger);

    expect(store.runs.size).toBe(1);
    expect(store.evaluations.size).toBe(1);
    expect(store.details.size).toBe(1);
  });

  it('surfaces observation persistence failure so webhook processing can retry', async () => {
    const store = new MemoryStore();
    store.failObservation = true;
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fake = fakeClient('sha');
    const orchestrator = new SparkOrchestrator({ store, sparkAppId: 42, createClient: async () => fake.client });

    await expect(orchestrator.handle(evaluationRequest('sha'), trigger('delivery-fail'))).rejects.toThrow('synthetic observation persistence failure');

    expect(fake.created).toHaveLength(1);
    expect(store.evaluations.size).toBe(0);
    expect(store.details.size).toBe(0);
    expect(store.runs.size).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"stage":"persist_observation"'));
    log.mockRestore();
  });

  it('keeps an unsupported repository truthful and non-blocking', async () => {
    const store = new MemoryStore();
    const fake = fakeClient('sha');
    const orchestrator = new SparkOrchestrator({ store, sparkAppId: 42, createClient: async () => fake.client });
    const result = await orchestrator.handle(evaluationRequest('sha'), trigger('delivery-unsupported'));
    expect(result.evaluation).toMatchObject({ attention: 'MEDIUM', directAreas: ['Repository root'] });
    expect(result.evaluation?.reasons).toContain('Structural uncertainty; repository topology could not be deeply analyzed');
    expect(fake.created[0]).toMatchObject({ conclusion: 'neutral' });
  });
});

describe('HTTP webhook endpoint', () => {
  const env = {
    GITHUB_APP_ID: '42', GITHUB_PRIVATE_KEY: 'unused', GITHUB_WEBHOOK_SECRET: 'secret', DB: {} as Env['DB'],
  };

  it('rejects invalid webhook signatures before processing', async () => {
    const store = new MemoryStore();
    const orchestrator = { handle: vi.fn() } as unknown as SparkOrchestrator;
    const context = new TestExecutionContext();
    const response = await handleRequest(new Request('https://spark.test/webhooks/github', {
      method: 'POST', body: '{}', headers: { 'x-hub-signature-256': 'sha256=' + '00'.repeat(32), 'x-github-delivery': 'd1', 'x-github-event': 'ping' },
    }), env, context, { store, orchestrator });
    expect(response.status).toBe(401);
    expect(orchestrator.handle).not.toHaveBeenCalled();
    expect(context.backgroundTasks).toHaveLength(0);
  });

  it('claims a delivery once so duplicates do not repeat work', async () => {
    const store = new MemoryStore();
    const orchestrator = { handle: vi.fn(async () => ({ status: 'ignored' })) } as unknown as SparkOrchestrator;
    const firstContext = new TestExecutionContext();
    const secondContext = new TestExecutionContext();
    const body = JSON.stringify({ zen: 'hello' });
    const headers = { 'x-hub-signature-256': await sign(body, 'secret'), 'x-github-delivery': 'same-delivery', 'x-github-event': 'ping' };
    const first = await handleRequest(new Request('https://spark.test/webhooks/github', { method: 'POST', body, headers }), env, firstContext, { store, orchestrator });
    const second = await handleRequest(new Request('https://spark.test/webhooks/github', { method: 'POST', body, headers }), env, secondContext, { store, orchestrator });
    expect(first.status).toBe(202);
    expect(await second.json()).toMatchObject({ duplicate: true });
    expect(firstContext.backgroundTasks).toHaveLength(1);
    expect(secondContext.backgroundTasks).toHaveLength(0);
    await firstContext.drain();
    expect(orchestrator.handle).toHaveBeenCalledTimes(1);
    expect(orchestrator.handle).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      deliveryId: 'same-delivery', event: 'ping', action: '',
    }));
  });

  it('releases a failed delivery so GitHub can retry it', async () => {
    const store = new MemoryStore();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const orchestrator = {
      handle: vi.fn()
        .mockRejectedValueOnce(new Error('temporary GitHub API failure'))
        .mockResolvedValueOnce({ status: 'ignored' }),
    } as unknown as SparkOrchestrator;
    const body = JSON.stringify({ zen: 'retry' });
    const headers = { 'x-hub-signature-256': await sign(body, 'secret'), 'x-github-delivery': 'retry-delivery', 'x-github-event': 'ping' };
    const firstContext = new TestExecutionContext();
    const first = await handleRequest(new Request('https://spark.test/webhooks/github', { method: 'POST', body, headers }), env, firstContext, { store, orchestrator });
    expect(first.status).toBe(202);
    await firstContext.drain();
    expect(store.deliveries.has('retry-delivery')).toBe(false);

    const secondContext = new TestExecutionContext();
    const second = await handleRequest(new Request('https://spark.test/webhooks/github', { method: 'POST', body, headers }), env, secondContext, { store, orchestrator });
    expect(second.status).toBe(202);
    await secondContext.drain();
    expect(orchestrator.handle).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"deliveryReleased":true'));
    log.mockRestore();
  });

  it('returns 202 without waiting for long-running orchestration', async () => {
    const store = new MemoryStore();
    let finishOrchestration: (() => void) | undefined;
    const orchestration = new Promise<void>(resolve => { finishOrchestration = resolve; });
    const orchestrator = {
      handle: vi.fn(async () => {
        await orchestration;
        return { status: 'ignored' };
      }),
    } as unknown as SparkOrchestrator;
    const context = new TestExecutionContext();
    const body = JSON.stringify({ zen: 'slow' });
    const headers = { 'x-hub-signature-256': await sign(body, 'secret'), 'x-github-delivery': 'slow-delivery', 'x-github-event': 'ping' };

    const outcome = await Promise.race([
      handleRequest(new Request('https://spark.test/webhooks/github', { method: 'POST', body, headers }), env, context, { store, orchestrator }),
      new Promise<'timed-out'>(resolve => setTimeout(() => resolve('timed-out'), 100)),
    ]);

    expect(outcome).toBeInstanceOf(Response);
    expect((outcome as Response).status).toBe(202);
    expect(context.backgroundTasks).toHaveLength(1);
    expect(orchestrator.handle).toHaveBeenCalledTimes(1);
    finishOrchestration?.();
    await context.drain();
  });

  it('serves the landing, health, privacy, and terms pages', async () => {
    const publicEnv = { ...env, GITHUB_APP_SLUG: 'spark-test', SPARK_CONTACT_EMAIL: 'hello@example.test' };
    const context = new TestExecutionContext();
    const landing = await handleRequest(new Request('https://spark.test/'), publicEnv, context);
    const health = await handleRequest(new Request('https://spark.test/health'), publicEnv, context);
    const privacy = await handleRequest(new Request('https://spark.test/privacy'), publicEnv, context);
    const terms = await handleRequest(new Request('https://spark.test/terms'), publicEnv, context);

    expect(landing.status).toBe(200);
    expect(await landing.text()).toContain('Install Spark on GitHub');
    expect(await health.json()).toEqual({ status: 'ok' });
    expect(await privacy.text()).toContain('does not intentionally persist GitHub installation access tokens');
    expect(await terms.text()).toContain('do not guarantee that software is correct, secure, tested, or safe to deploy');
    expect(context.backgroundTasks).toHaveLength(0);
  });
});
