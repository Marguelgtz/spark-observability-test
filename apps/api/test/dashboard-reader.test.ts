import { describe, expect, it } from 'vitest';
import { detailFromRow, summaryFromRow } from '../src/dashboard-reader';
import type { StoredEvaluationDetailV1 } from '../src/evaluation-detail';

const detail: StoredEvaluationDetailV1 = {
  version: 1,
  repository: {
    id: 2,
    owner: 'acme',
    name: 'repo',
    fullName: 'acme/repo',
    url: 'https://github.com/acme/repo',
  },
  pullRequest: {
    number: 3,
    title: 'Tighten auth checks',
    url: 'https://github.com/acme/repo/pull/3',
    state: 'open',
  },
  headSha: 'abc123',
  baseSha: 'base123',
  evaluatedAt: '2026-08-27T12:00:00.000Z',
  evaluatorVersion: 'deterministic-v1',
  check: { id: 44, url: 'https://github.com/acme/repo/runs/44' },
  input: {
    change: {
      id: 'abc123',
      files: [
        { path: 'src/auth.ts', status: 'modified' },
        { path: 'config/policy.yml', status: 'deleted' },
      ],
    },
    context: { projects: [] },
    evidence: [],
    analysis: { changedFiles: 'complete', repositoryContext: 'unknown', notes: ['No workspace topology observed'] },
  },
  evaluation: {
    changeId: 'abc123',
    attention: 'HIGH',
    reasons: ['Authentication/security surface touched', 'Integration evidence failed'],
    directAreas: ['Repository root'],
    affectedAreas: [],
    sensitiveSurfaces: ['auth/security'],
    evidence: [
      { name: 'integration', kind: 'check-run', status: 'FAILED', source: 'github-actions', knowledge: 'observed', coverage: 'UNKNOWN' },
    ],
    analysis: { changedFiles: 'complete', repositoryContext: 'unknown', notes: ['No workspace topology observed'] },
  },
  truncation: { truncated: false, fields: [] },
};

const row = {
  repository_id: 2,
  full_name: 'acme/repo',
  head_sha: 'abc123',
  pull_request_number: 3,
  attention: 'HIGH' as const,
  evaluated_at: '2026-08-27T12:00:00.000Z',
  normalized_json: JSON.stringify(detail),
  check_url: 'https://github.com/acme/repo/runs/44',
};

describe('dashboard row normalization', () => {
  it('builds compact activity summaries from normalized evaluation history', () => {
    expect(summaryFromRow(row)).toMatchObject({
      pullRequest: { title: 'Tighten auth checks' },
      attention: 'HIGH',
      topReasons: ['Authentication/security surface touched', 'Integration evidence failed'],
      changeSummary: {
        files: 2,
        extensions: [
          { extension: '.ts', count: 1 },
          { extension: '.yml', count: 1 },
        ],
      },
      sensitiveSurfaces: ['auth/security'],
      evidenceSummary: { failed: 1 },
      detailAvailable: true,
    });
  });

  it('maps normalized history into the dashboard detail contract without source reconstruction', () => {
    const response = detailFromRow(row);
    expect(response.status).toBe('available');
    if (response.status !== 'available') throw new Error('expected detail');
    expect(response.detail.changedFiles).toEqual([
      { path: 'src/auth.ts', status: 'modified' },
      { path: 'config/policy.yml', status: 'removed' },
    ]);
    expect(response.detail.unmappedPaths).toEqual(['src/auth.ts', 'config/policy.yml']);
    expect(response.detail.evidence[0]).toMatchObject({ name: 'integration', status: 'FAILED', coverage: 'UNKNOWN' });
  });

  it('keeps pre-detail rows explicitly unavailable instead of fabricating history', () => {
    const response = detailFromRow({ ...row, normalized_json: null, check_url: null });
    expect(response).toMatchObject({
      version: 1,
      status: 'unavailable',
      reason: 'LEGACY_RECORD',
      summary: {
        pullRequest: { title: 'PR #3' },
        detailAvailable: false,
        changeSummary: { files: 0 },
      },
    });
  });
});
