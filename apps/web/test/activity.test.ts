import { describe, expect, it } from 'vitest';
import { buildFixtureActivity, FIXTURE_NOW, getFixturePullRequestHistory } from '../src/fixtures';
import type { ActivityQueryV1 } from '@spark/dashboard-contracts';

const query = (patch: Partial<ActivityQueryV1> = {}): ActivityQueryV1 => ({
  window: '7d',
  attention: 'ALL',
  repositoryId: null,
  limit: 25,
  ...patch
});

describe('fixture activity', () => {
  it('filters 24h, 7d, and 30d windows by latest pull request evaluation', () => {
    expect(buildFixtureActivity(query({ window: '24h' }), FIXTURE_NOW).pullRequests).toHaveLength(3);
    expect(buildFixtureActivity(query({ window: '7d' }), FIXTURE_NOW).pullRequests).toHaveLength(5);
    expect(buildFixtureActivity(query({ window: '30d' }), FIXTURE_NOW).pullRequests).toHaveLength(7);
  });

  it('excludes pull requests whose latest evaluation is outside 30 days', () => {
    const response = buildFixtureActivity(query({ window: '30d' }), FIXTURE_NOW);
    expect(response.pullRequests.some((item) => item.pullRequest.number === 100)).toBe(false);
  });

  it('filters on latest pull request attention', () => {
    expect(buildFixtureActivity(query({ attention: 'HIGH' }), FIXTURE_NOW).pullRequests.every((item) => item.latest.attention === 'HIGH')).toBe(true);
    expect(buildFixtureActivity(query({ attention: 'MEDIUM' }), FIXTURE_NOW).pullRequests.every((item) => item.latest.attention === 'MEDIUM')).toBe(true);
    expect(buildFixtureActivity(query({ attention: 'LOW' }), FIXTURE_NOW).pullRequests.every((item) => item.latest.attention === 'LOW')).toBe(true);
  });

  it('calculates attention counts before applying attention filter', () => {
    const all = buildFixtureActivity(query({ window: '7d', attention: 'ALL' }), FIXTURE_NOW);
    const high = buildFixtureActivity(query({ window: '7d', attention: 'HIGH' }), FIXTURE_NOW);
    expect(high.counts).toEqual(all.counts);
    expect(high.pullRequests).toHaveLength(all.counts.HIGH);
  });

  it('filters a repository while keeping all observed repository choices', () => {
    const response = buildFixtureActivity(query({ repositoryId: 101 }), FIXTURE_NOW);
    expect(response.pullRequests.every((item) => item.repository.id === 101)).toBe(true);
    expect(response.repositories.map((item) => item.id)).toEqual([101, 202, 303]);
  });

  it('computes pull request counts for the selected window', () => {
    const response = buildFixtureActivity(query({ window: '24h' }), FIXTURE_NOW);
    expect(response.repositories.map((item) => [item.id, item.pullRequestCount])).toEqual([[101, 1], [202, 1], [303, 1]]);
  });

  it('sorts pull requests by latest evaluation newest first', () => {
    const response = buildFixtureActivity(query({ window: '30d' }), FIXTURE_NOW);
    const timestamps = response.pullRequests.map((item) => Date.parse(item.latest.evaluatedAt));
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
  });

  it('keeps multiple evaluations grouped under one pull request history', () => {
    const response = buildFixtureActivity(query({ window: '24h' }), FIXTURE_NOW);
    const auth = response.pullRequests.find((item) => item.pullRequest.number === 42);
    expect(auth?.history).toEqual({
      runCount: 3,
      attentionCounts: { LOW: 1, MEDIUM: 1, HIGH: 1 }
    });
    const history = getFixturePullRequestHistory(101, 42);
    expect(history.runs).toHaveLength(3);
    expect(history.runs[0].headSha).toBe(auth?.latest.headSha);
  });
});
