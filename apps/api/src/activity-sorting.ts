import type { ActivityResponseV1, PullRequestActivityV1 } from '@spark/dashboard-contracts';
import { handleRequest, type Env, type WorkerExecutionContext } from './app';

export const ACTIVITY_SORTS = ['recent', 'attention', 'evaluations', 'repository'] as const;
export type ActivitySort = typeof ACTIVITY_SORTS[number];

const SORTS = new Set<ActivitySort>(ACTIVITY_SORTS);
const INTERNAL_PAGE_SIZE = 100;

interface SortCursorV1 {
  v: 1;
  sort: ActivitySort;
  offset: number;
}

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
}

function parseSort(value: string | null): ActivitySort | undefined {
  return value && SORTS.has(value as ActivitySort) ? value as ActivitySort : undefined;
}

function encodeCursor(cursor: SortCursorV1): string {
  return btoa(JSON.stringify(cursor)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeCursor(value: string | null, sort: ActivitySort): SortCursorV1 | undefined {
  if (!value) return { v: 1, sort, offset: 0 };
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    const parsed = JSON.parse(atob(padded)) as Partial<SortCursorV1>;
    return parsed.v === 1
      && parsed.sort === sort
      && Number.isSafeInteger(parsed.offset)
      && Number(parsed.offset) >= 0
      ? { v: 1, sort, offset: Number(parsed.offset) }
      : undefined;
  } catch {
    return undefined;
  }
}

function compareRecent(a: PullRequestActivityV1, b: PullRequestActivityV1): number {
  const time = Date.parse(b.latest.evaluatedAt) - Date.parse(a.latest.evaluatedAt);
  if (time !== 0) return time;
  if (a.repository.id !== b.repository.id) return b.repository.id - a.repository.id;
  return b.pullRequest.number - a.pullRequest.number;
}

const ATTENTION_RANK = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;

function comparator(sort: ActivitySort): (a: PullRequestActivityV1, b: PullRequestActivityV1) => number {
  if (sort === 'attention') {
    return (a, b) => ATTENTION_RANK[b.latest.attention] - ATTENTION_RANK[a.latest.attention] || compareRecent(a, b);
  }
  if (sort === 'evaluations') {
    return (a, b) => b.history.runCount - a.history.runCount || compareRecent(a, b);
  }
  if (sort === 'repository') {
    return (a, b) => {
      const aName = `${a.repository.owner}/${a.repository.name}`;
      const bName = `${b.repository.owner}/${b.repository.name}`;
      return aName.localeCompare(bName, undefined, { sensitivity: 'base' }) || compareRecent(a, b);
    };
  }
  return compareRecent;
}

function internalRequest(request: Request, cursor: string | null): Request {
  const url = new URL(request.url);
  url.searchParams.delete('sort');
  url.searchParams.set('limit', String(INTERNAL_PAGE_SIZE));
  if (cursor) url.searchParams.set('cursor', cursor);
  else url.searchParams.delete('cursor');
  return new Request(url.toString(), {
    method: 'GET',
    headers: request.headers,
  });
}

async function readAllActivity(
  request: Request,
  env: Env,
  context: WorkerExecutionContext,
): Promise<{ response: Response; body: ActivityResponseV1 } | Response> {
  let cursor: string | null = null;
  let firstResponse: Response | undefined;
  let firstBody: ActivityResponseV1 | undefined;
  const pullRequests: PullRequestActivityV1[] = [];
  const seen = new Set<string>();

  do {
    const response = await handleRequest(internalRequest(request, cursor), env, context);
    if (!response.ok) return response;
    const body = await response.json() as ActivityResponseV1;
    if (!firstResponse) {
      firstResponse = response;
      firstBody = body;
    }
    for (const item of body.pullRequests) {
      const key = `${item.repository.id}:${item.pullRequest.number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pullRequests.push(item);
    }
    cursor = body.pagination.nextCursor;
  } while (cursor);

  if (!firstResponse || !firstBody) return json({ error: 'activity unavailable' }, 500);
  return {
    response: firstResponse,
    body: {
      ...firstBody,
      pullRequests,
      total: firstBody.total ?? pullRequests.length,
      pagination: { nextCursor: null },
    },
  };
}

export function isSortedActivityRequest(request: Request): boolean {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  return url.pathname === '/api/activity' && url.searchParams.has('sort') && url.searchParams.get('sort') !== 'recent';
}

export async function handleSortedActivityRequest(
  request: Request,
  env: Env,
  context: WorkerExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const sort = parseSort(url.searchParams.get('sort'));
  if (!sort || sort === 'recent') return json({ error: 'invalid activity sort' }, 400);

  const rawLimit = url.searchParams.get('limit');
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    return json({ error: 'invalid activity query' }, 400);
  }

  const cursor = decodeCursor(url.searchParams.get('cursor'), sort);
  if (!cursor) return json({ error: 'invalid activity cursor' }, 400);

  const gathered = await readAllActivity(request, env, context);
  if (gathered instanceof Response) return gathered;

  const sorted = [...gathered.body.pullRequests].sort(comparator(sort));
  const page = sorted.slice(cursor.offset, cursor.offset + limit);
  const nextOffset = cursor.offset + page.length;
  const nextCursor = nextOffset < sorted.length
    ? encodeCursor({ v: 1, sort, offset: nextOffset })
    : null;
  const headers = new Headers(gathered.response.headers);
  headers.set('content-type', 'application/json');
  headers.set('cache-control', 'no-store');

  return new Response(JSON.stringify({
    ...gathered.body,
    pullRequests: page,
    total: gathered.body.total ?? sorted.length,
    pagination: { nextCursor },
  } satisfies ActivityResponseV1), {
    status: gathered.response.status,
    statusText: gathered.response.statusText,
    headers,
  });
}
