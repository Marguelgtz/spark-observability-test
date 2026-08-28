import { describe, expect, it } from 'vitest';
import { parseRoute } from '../src/router';

describe('dashboard router', () => {
  it('parses overview drilldown routes', () => {
    expect(parseRoute('/app/overview/pull-requests')).toEqual({ kind: 'overview', metric: 'pull-requests' });
    expect(parseRoute('/app/overview/evaluations')).toEqual({ kind: 'overview', metric: 'evaluations' });
    expect(parseRoute('/app/overview/attention')).toEqual({ kind: 'overview', metric: 'attention' });
    expect(parseRoute('/app/overview/merged-unresolved')).toEqual({ kind: 'overview', metric: 'merged-unresolved' });
  });

  it('parses pull request observability routes', () => {
    expect(parseRoute('/app/repositories/101/pulls/42')).toEqual({
      kind: 'pull-request',
      repositoryId: 101,
      pullRequestNumber: 42,
    });
  });

  it('parses encoded immutable run identities independently from SHA routes', () => {
    expect(parseRoute('/app/repositories/101/runs/run%3A42%3A1')).toEqual({
      kind: 'run',
      repositoryId: 101,
      runId: 'run:42:1',
    });
  });

  it('keeps evaluation routes distinct from pull request and run routes', () => {
    expect(parseRoute('/app/evaluations/101/a42c11e7')).toEqual({
      kind: 'evaluation',
      repositoryId: 101,
      headSha: 'a42c11e7',
    });
  });
});
