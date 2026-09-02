import { describe, expect, it } from 'vitest';
import { defaultDashboardSettings, resolvePreferences } from '../src/preferences';

describe('dashboard preference resolution', () => {
  it('uses stable product defaults when no settings row exists', () => {
    expect(defaultDashboardSettings()).toEqual({
      version: 1,
      revision: 0,
      defaultWindow: '7d',
      previewSize: 15,
      density: 'COMFORTABLE',
      collapseSecondarySections: true,
      defaultRepositoryId: null,
      updatedAt: null,
    });
  });

  it('gives explicit URL state precedence over saved settings', () => {
    const settings = {
      ...defaultDashboardSettings(),
      revision: 4,
      defaultWindow: '24h' as const,
      previewSize: 10 as const,
      defaultRepositoryId: 303,
      updatedAt: '2026-08-30T08:00:00.000Z',
    };

    expect(resolvePreferences('', settings).state).toMatchObject({ window: '24h', repositoryId: 303 });
    expect(resolvePreferences('?window=30d&repositoryId=202', settings).state).toMatchObject({ window: '30d', repositoryId: 202 });
    expect(resolvePreferences('?repositoryId=all', settings).state).toMatchObject({ window: '24h', repositoryId: null });
  });

  it('keeps API page limits separate from the saved progressive-list preview', () => {
    const settings = { ...defaultDashboardSettings(), previewSize: 10 as const };
    const resolved = resolvePreferences('?limit=5', settings);
    expect(resolved.state.limit).toBe(5);
    expect(resolved.settings.previewSize).toBe(10);
  });
});
