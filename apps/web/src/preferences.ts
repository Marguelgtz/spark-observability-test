import type { DashboardSettingsV1 } from '@spark/dashboard-contracts';
import { DASHBOARD_SETTINGS_DEFAULTS } from '@spark/dashboard-contracts';
import { parseActivityState, type ActivityUrlState } from './state';

export const SETTINGS_FALLBACK_WARNING = 'Saved preferences could not be loaded. Spark defaults are in use for this session.';

export function defaultDashboardSettings(): DashboardSettingsV1 {
  return {
    version: 1,
    revision: 0,
    ...DASHBOARD_SETTINGS_DEFAULTS,
    updatedAt: null,
  };
}

export interface ResolvedPreferences {
  settings: DashboardSettingsV1;
  state: ActivityUrlState;
}

export function resolvePreferences(search: string, settings: DashboardSettingsV1 = defaultDashboardSettings()): ResolvedPreferences {
  return {
    settings,
    state: parseActivityState(search, {
      defaultWindow: settings.defaultWindow,
      defaultRepositoryId: settings.defaultRepositoryId,
    }),
  };
}
