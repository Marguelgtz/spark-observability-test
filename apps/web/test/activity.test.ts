import { describe, expect, it } from 'vitest';
import { buildFixtureActivity, FIXTURE_NOW } from '../src/fixtures';
import type { ActivityQueryV1 } from '@spark/dashboard-contracts';

const query = (patch: Partial<ActivityQueryV1> = {}): ActivityQueryV1 => ({
  window: '7d',
  attention: 'ALL',
  repositoryId: null,
  limit: 25,
  ...patch
});

describe('fixture activity', () => {
  it('filters 24h, 7d, and 30d windows', () => {
    expect(buildFixtureActivity(query({ window: '24h' }), FIXTURE_NOW).evaluations).toHaveLength(3);
    expect(buildFixtureActivity(query({ window: '7d' }), FIXTURE_NOW).evaluations).toHaveLength(5);
    expect(buildFixtureActivity(query({ window: '30d' }), FIXTURE_NOW).evaluations).toHaveLength(7);
  });

  it('excludes records outside 30 days', () => {
    const response = buildFixtureActivity(query({ window: '30d' }), FIXTURE_NOW);
    expect(response.evaluations.some((item) => item.pullRequest.number === 100)).toBe(false);
  });

  it('filters all attention levels', () => {
    expect(buildFixtureActivity(query({ attention: 'HIGH' }), FIXTURE_NOW).evaluations.every((item) => item.attention === 'HIGH')).toBe(true);
    expect(buildFixtureActivity(query({ attention: 'MEDIUM' }), FIXTURE_NOW).evaluations.every((item) => item.attention === 'MEDIUM')).toBe(true);
    expect(buildFixtureActivity(query({ attention: 'LOW' }), FIXTURE_NOW).evaluations.every((item) => item.attention === 'LOW')).toBe(true);
  });

  it('calculates attention counts before applying attention filter', () => {
    const all = buildFixtureActivity(query({ window: '7d', attention: 'ALL' }), FIXTURE_NOW);
    const high = buildFixtureActivity(query({ window: '7d', attention: 'HIGH' }), FIXTURE_NOW);
    expect(high.counts).toEqual(all.counts);
    expect(high.evaluations).toHaveLength(all.counts.HIGH);
  });

  it('filters a repository while keeping all observed repository choices', () => {
    const response = buildFixtureActivity(query({ repositoryId: 101 }), FIXTURE_NOW);
    expect(response.evaluations.every((item) => item.repository.id === 101)).toBe(true);
    expect(response.repositories.map((item) => item.id)).toEqual([101, 202, 303]);
  });

  it('computes repository counts for the selected window', () => {
    const response = buildFixtureActivity(query({ window: '24h' }), FIXTURE_NOW);
    expect(response.repositories.map((item) => [item.id, item.evaluationCount])).toEqual([[101, 1], [202, 1], [303, 1]]);
  });

  it('sorts chronologically newest first', () => {
    const response = buildFixtureActivity(query({ window: '30d' }), FIXTURE_NOW);
    const timestamps = response.evaluations.map((item) => Date.parse(item.evaluatedAt));
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
  });
});
