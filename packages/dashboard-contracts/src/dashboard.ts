import type {
  ActivityOverviewV1,
  ActivityWindowV1,
  AttentionLevelV1,
  NeedsAttentionV1,
  ObservedRepositoryV1,
  PullRequestActivityV1,
} from './index';

export interface DashboardQueryV1 {
  window: ActivityWindowV1;
  repositoryId: number | null;
}

export interface ActiveChangesV1 {
  total: number;
  preview: PullRequestActivityV1[];
}

export interface OperationalDashboardResponseV1 {
  version: 1;
  selectedWindow: ActivityWindowV1;
  selectedRepositoryId: number | null;
  counts: Record<AttentionLevelV1, number>;
  repositories: ObservedRepositoryV1[];
  overview: ActivityOverviewV1;
  needsAttention: NeedsAttentionV1;
  activeChanges: ActiveChangesV1;
  hasObservedHistory: boolean;
}
