import { describe, expect, it } from 'vitest';
import { legacyActivityRedirect, parseRoute } from '../src/router';
import { evaluationHref } from '../src/pr-ui';

describe('dashboard router', () => {
  it('splits dashboard, activity, settings, and account routes', () => {
    expect(parseRoute('/app')).toEqual({ kind: 'dashboard' });
    expect(parseRoute('/app/')).toEqual({ kind: 'dashboard' });
    expect(parseRoute('/app/activity')).toEqual({ kind: 'activity' });
    expect(parseRoute('/app/activity/')).toEqual({ kind: 'activity' });
    expect(parseRoute('/app/settings')).toEqual({ kind: 'settings' });
    expect(parseRoute('/app/account')).toEqual({ kind: 'account' });
  });

  it('redirects legacy activity-only dashboard bookmarks and preserves their query', () => {
    expect(legacyActivityRedirect('/app', '?window=7d&attention=HIGH&q=checkout&favorites=1')).toBe(
      '/app/activity?window=7d&attention=HIGH&q=checkout&favorites=1',
    );
    expect(legacyActivityRedirect('/app/', '?cursor=opaque&repositoryId=101')).toBe(
      '/app/activity?cursor=opaque&repositoryId=101',
    );
    expect(legacyActivityRedirect('/app', '?window=30d&repositoryId=101&attention=ALL')).toBeNull();
    expect(legacyActivityRedirect('/app/activity', '?attention=HIGH')).toBeNull();
  });

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

  it('re-parses every evaluation href the builder produces, including non-hex ids (R6.1/R6.2)', () => {
    expect(parseRoute(evaluationHref(101, 'a42c11e7', ''))).toEqual({ kind: 'evaluation', repositoryId: 101, headSha: 'a42c11e7' });
    // A non-hex / arbitrary id must re-parse (never silently 404): the builder and parser share one id grammar.
    expect(parseRoute(evaluationHref(101, 'not-a-hex-sha', ''))).toEqual({ kind: 'evaluation', repositoryId: 101, headSha: 'not-a-hex-sha' });
  });
});
