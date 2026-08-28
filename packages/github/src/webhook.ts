import type { GitHubEventRequest } from './types';

const encoder = new TextEncoder();

function fromHex(value: string): Uint8Array | null {
  if (!/^[a-f\d]+$/i.test(value) || value.length % 2 !== 0) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export async function verifyWebhookSignature(
  body: ArrayBuffer | Uint8Array,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature?.startsWith('sha256=') || !secret) return false;
  const signatureBytes = fromHex(signature.slice(7));
  if (!signatureBytes || signatureBytes.byteLength !== 32) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const signatureBuffer = signatureBytes.buffer.slice(signatureBytes.byteOffset, signatureBytes.byteOffset + signatureBytes.byteLength) as ArrayBuffer;
  const bodyBuffer = body instanceof Uint8Array
    ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer
    : body;
  return crypto.subtle.verify('HMAC', key, signatureBuffer, bodyBuffer);
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function routeGitHubEvent(event: string, payload: Record<string, unknown>, sparkAppId?: number): GitHubEventRequest {
  const action = string(payload.action) ?? '';
  const installationId = number(object(payload.installation)?.id);
  const repository = object(payload.repository);
  const repositoryId = number(repository?.id);
  const repositoryFullName = string(repository?.full_name);

  if (event === 'installation') {
    return { kind: 'installation', action, installationId, payload };
  }
  if (event === 'installation_repositories') {
    return { kind: 'installation_repositories', action, installationId, payload };
  }
  if (event === 'pull_request' && ['opened', 'reopened', 'closed'].includes(action)) {
    const pullRequest = object(payload.pull_request);
    const merged = pullRequest?.merged === true;
    const openedAt = string(pullRequest?.created_at);
    const closedAt = string(pullRequest?.closed_at);
    const mergedAt = string(pullRequest?.merged_at);
    const occurredAt = mergedAt ?? closedAt ?? string(pullRequest?.updated_at) ?? openedAt ?? '';
    return {
      kind: 'pull_request_lifecycle', action, installationId, repositoryId, repositoryFullName,
      pullRequestNumber: number(pullRequest?.number),
      headSha: string(object(pullRequest?.head)?.sha), payload,
      lifecycle: {
        state: merged ? 'MERGED' : action === 'closed' ? 'CLOSED' : 'OPEN',
        ...(openedAt ? { openedAt } : {}),
        ...(closedAt ? { closedAt } : {}),
        ...(mergedAt ? { mergedAt } : {}),
        ...(string(pullRequest?.merge_commit_sha) ? { mergeSha: string(pullRequest?.merge_commit_sha) } : {}),
        occurredAt,
        evaluate: action !== 'closed',
      },
    };
  }
  if (event === 'pull_request' && action === 'synchronize') {
    const pullRequest = object(payload.pull_request);
    return {
      kind: 'evaluate', action, installationId, repositoryId, repositoryFullName,
      pullRequestNumber: number(pullRequest?.number),
      headSha: string(object(pullRequest?.head)?.sha), payload,
    };
  }
  if (event === 'check_run' && ['created', 'rerequested', 'completed'].includes(action)) {
    const checkRun = object(payload.check_run);
    const app = object(checkRun?.app);
    const isSparkCheck = string(checkRun?.name) === 'Spark Observability'
      && (sparkAppId === undefined || number(app?.id) === sparkAppId);
    if (isSparkCheck) return { kind: 'ignore', action, payload };
    const pullRequests = Array.isArray(checkRun?.pull_requests) ? checkRun.pull_requests : [];
    const pullRequest = object(pullRequests[0]);
    if (!pullRequest) return { kind: 'ignore', action, payload };
    return {
      kind: 'evaluate', action, installationId, repositoryId, repositoryFullName,
      pullRequestNumber: number(pullRequest.number),
      headSha: string(checkRun?.head_sha), payload,
    };
  }
  return { kind: 'ignore', action, payload };
}
