import type { ActivityQueryV1, ActivityWindowV1, AttentionFilterV1 } from '@spark/dashboard-contracts';

const WINDOWS = new Set<ActivityWindowV1>(['24h', '7d', '30d']);
const ATTENTION = new Set<AttentionFilterV1>(['ALL', 'LOW', 'MEDIUM', 'HIGH']);

export interface ActivityUrlState extends ActivityQueryV1 {
  repositorySelection?: RepositorySelection;
  fixture?: string;
  query?: string;
  favoritesOnly?: boolean;
}

export type RepositorySelection =
  | { kind: 'absent' }
  | { kind: 'all' }
  | { kind: 'repository'; id: number };

export interface ActivityStateDefaults {
  defaultWindow: ActivityWindowV1;
  defaultRepositoryId: number | null;
}

const BUILT_IN_DEFAULTS: ActivityStateDefaults = {
  defaultWindow: '7d',
  defaultRepositoryId: null,
};

function parseRepositorySelection(params: URLSearchParams): RepositorySelection {
  if (!params.has('repositoryId')) return { kind: 'absent' };
  const raw = params.get('repositoryId');
  const id = raw && /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (Number.isSafeInteger(id) && id > 0) return { kind: 'repository', id };
  return { kind: 'all' };
}

export function parseActivityState(search: string, defaults: ActivityStateDefaults = BUILT_IN_DEFAULTS): ActivityUrlState {
  const params = new URLSearchParams(search);
  const windowValue = params.get('window') as ActivityWindowV1 | null;
  const attentionValue = params.get('attention') as AttentionFilterV1 | null;
  const repositorySelection = parseRepositorySelection(params);
  const repositoryId = repositorySelection.kind === 'repository'
    ? repositorySelection.id
    : repositorySelection.kind === 'all'
      ? null
      : defaults.defaultRepositoryId;
  const limitValue = params.get('limit');
  const parsedLimit = limitValue && /^\d+$/.test(limitValue) ? Number(limitValue) : undefined;

  return {
    window: windowValue && WINDOWS.has(windowValue) ? windowValue : defaults.defaultWindow,
    attention: attentionValue && ATTENTION.has(attentionValue) ? attentionValue : 'ALL',
    repositoryId,
    repositorySelection,
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
  if (state.repositorySelection?.kind === 'all') params.set('repositoryId', 'all');
  else if (state.repositorySelection?.kind === 'repository') params.set('repositoryId', String(state.repositorySelection.id));
  else if (!state.repositorySelection && state.repositoryId !== null) params.set('repositoryId', String(state.repositoryId));
  if (state.fixture) params.set('fixture', state.fixture);
  if (state.query) params.set('q', state.query);
  if (state.favoritesOnly) params.set('favorites', '1');
  return params.toString();
}

export function withActivityState(current: ActivityUrlState, patch: Partial<ActivityUrlState>): ActivityUrlState {
  const next = {
    ...current,
    ...patch,
    cursor: null
  };
  if (Object.prototype.hasOwnProperty.call(patch, 'repositoryId') && !patch.repositorySelection) {
    next.repositorySelection = patch.repositoryId === null
      ? { kind: 'all' }
      : { kind: 'repository', id: patch.repositoryId! };
  }
  return next;
}
