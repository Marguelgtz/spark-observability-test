import type {
  ActivityResponseV1,
  AttentionLevelV1,
  EvaluationSummaryV1,
  PullRequestActivityV1,
} from '@spark/dashboard-contracts';
import { handleRequest, type Env, type WorkerExecutionContext } from './app';
import { handleBehaviorRequest, isBehaviorRequest } from './behavior-handler';
import { handleOverviewRequest, isOverviewRequest } from './overview-handler';

interface CompatibleRepository {
  id: number;
  owner: string;
  name: string;
  url: string;
  pullRequestCount?: number;
  evaluationCount?: number;
}

type ActivityV1CompatibilityBody = Omit<Partial<ActivityResponseV1>, 'repositories' | 'evaluations' | 'pullRequests'> & {
  evaluations?: EvaluationSummaryV1[];
  pullRequests?: PullRequestActivityV1[];
  repositories?: CompatibleRepository[];
};

function attentionCounts(attention: AttentionLevelV1): Record<AttentionLevelV1, number> {
  return {
    LOW: attention === 'LOW' ? 1 : 0,
    MEDIUM: attention === 'MEDIUM' ? 1 : 0,
    HIGH: attention === 'HIGH' ? 1 : 0,
  };
}

export function normalizeActivityV1(body: ActivityV1CompatibilityBody): ActivityV1CompatibilityBody {
  const normalized = { ...body };

  if (!Array.isArray(normalized.pullRequests) && Array.isArray(normalized.evaluations)) {
    normalized.pullRequests = normalized.evaluations.map((latest) => ({
      repository: latest.repository,
      pullRequest: latest.pullRequest,
      latest,
      history: {
        runCount: 1,
        attentionCounts: attentionCounts(latest.attention),
      },
    }));
  }

  if (!Array.isArray(normalized.evaluations) && Array.isArray(normalized.pullRequests)) {
    normalized.evaluations = normalized.pullRequests.map((activity) => activity.latest);
  }

  if (Array.isArray(normalized.repositories)) {
    normalized.repositories = normalized.repositories.map((repository) => {
      const count = repository.pullRequestCount ?? repository.evaluationCount ?? 0;
      return {
        ...repository,
        pullRequestCount: count,
        evaluationCount: count,
      };
    });
  }

  return normalized;
}

async function withActivityV1Compatibility(request: Request, response: Response): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/activity' || !response.ok) return response;
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return response;

  const body = normalizeActivityV1(await response.json() as ActivityV1CompatibilityBody);
  const headers = new Headers(response.headers);
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env, context: WorkerExecutionContext): Promise<Response> {
    if (isOverviewRequest(request)) return handleOverviewRequest(request, env);
    if (isBehaviorRequest(request)) return handleBehaviorRequest(request, env);
    const response = await handleRequest(request, env, context);
    return withActivityV1Compatibility(request, response);
  },
};
