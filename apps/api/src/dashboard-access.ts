import type { ViewerV1 } from '@spark/dashboard-contracts';

export interface DashboardPrincipal {
  viewer: ViewerV1;
  repositoryIds: number[];
  installationIds: number[];
  sessionExpiresAt: string;
}

export interface DashboardAuthorizer {
  authorize(request: Request): Promise<DashboardPrincipal | undefined>;
}

export class DenyDashboardAuthorizer implements DashboardAuthorizer {
  async authorize(): Promise<undefined> {
    return undefined;
  }
}
