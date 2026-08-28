import { describe, expect, it } from 'vitest';
import { parseRoute } from '../src/router';

describe('dashboard router', () => {
  it('parses pull request observability routes', () => {
    expect(parseRoute('/app/repositories/101/pulls/42')).toEqual({
      kind: 'pull-request',
      repositoryId: 101,
      pullRequestNumber: 42,
    });
  });

  it('keeps evaluation routes distinct from pull request routes', () => {
    expect(parseRoute('/app/evaluations/101/a42c11e7')).toEqual({
      kind: 'evaluation',
      repositoryId: 101,
      headSha: 'a42c11e7',
    });
  });
});
