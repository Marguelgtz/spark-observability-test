import type { ActivityQueryV1, ActivityWindowV1, AttentionFilterV1 } from '@spark/dashboard-contracts';

const WINDOWS = new Set<ActivityWindowV1>(['24h', '7d', '30d']);
const ATTENTION = new Set<AttentionFilterV1>(['ALL', 'LOW', 'MEDIUM', 'HIGH']);

export interface ActivityUrlState extends ActivityQueryV1 {
  fixture?: string;
  query?: string;
  favoritesOnly?: boolean;
}

export function parseActivityState(search: string): ActivityUrlState {
  const params = new URLSearchParams(search);
  const windowValue = params.get('window') as ActivityWindowV1 | null;
  const attentionValue = params.get('attention') as AttentionFilterV1 | null;
  const repositoryValue = params.get('repositoryId');
  const repositoryId = repositoryValue && /^\d+$/.test(repositoryValue) ? Number(repositoryValue) : null;
  const limitValue = params.get('limit');
  const parsedLimit = limitValue && /^\d+$/.test(limitValue) ? Number(limitValue) : undefined;

  return {
    window: windowValue && WINDOWS.has(windowValue) ? windowValue : '7d',
    attention: attentionValue && ATTENTION.has(attentionValue) ? attentionValue : 'ALL',
    repositoryId,
    cursor: params.get('cursor'),
    limit: parsedLimit && parsedLimit > 0 ? Math.min(parsedLimit, 50) : 25,
    fixture: params.get('fixture') ?? undefined,
    query: params.get('q')?.trim().slice(0, 100) || undefined,
    favoritesOnly: params.get('favorites') === '1'
  };
}

export function serializeActivityState(state: ActivityUrlState): string {
  const params = new URLSearchParams();
  params.set('window', state.window);
  params.set('attention', state.attention);
  if (state.repositoryId !== null) params.set('repositoryId', String(state.repositoryId));
  if (state.fixture) params.set('fixture', state.fixture);
  if (state.query) params.set('q', state.query);
  if (state.favoritesOnly) params.set('favorites', '1');
  return params.toString();
}

export function withActivityState(current: ActivityUrlState, patch: Partial<ActivityUrlState>): ActivityUrlState {
  return {
    ...current,
    ...patch,
    cursor: null
  };
}
