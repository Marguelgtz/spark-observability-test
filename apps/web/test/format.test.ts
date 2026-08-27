import { describe, expect, it } from 'vitest';
import { evidenceLabel, relativeTime, shortSha, trustedGitHubUrl } from '../src/format';
import { getFixtureEvaluation, fixtureEvaluations } from '../src/fixtures';

describe('dashboard formatting', () => {
  it('shortens SHAs', () => {
    expect(shortSha('abcdef1234567890')).toBe('abcdef12');
  });

  it('formats relative timestamps', () => {
    const now = Date.parse('2026-08-27T18:00:00Z');
    expect(relativeTime('2026-08-27T17:52:00Z', now)).toBe('8m');
    expect(relativeTime('2026-08-27T15:00:00Z', now)).toBe('3h');
    expect(relativeTime('2026-08-17T18:00:00Z', now)).toBe('10d');
  });

  it('prioritizes failed, missing, and pending evidence labels', () => {
    expect(evidenceLabel({ passed: 1, pending: 1, failed: 1, missing: 1, unknown: 0 })).toBe('1 failed');
    expect(evidenceLabel({ passed: 1, pending: 1, failed: 0, missing: 1, unknown: 0 })).toBe('1 missing');
    expect(evidenceLabel({ passed: 1, pending: 1, failed: 0, missing: 0, unknown: 0 })).toBe('1 pending');
  });

  it('allows only trusted GitHub HTTPS links', () => {
    expect(trustedGitHubUrl('https://github.com/acme/spark/pull/1')?.hostname).toBe('github.com');
    expect(trustedGitHubUrl('http://github.com/acme/spark')).toBeNull();
    expect(trustedGitHubUrl('https://example.com/acme/spark')).toBeNull();
    expect(trustedGitHubUrl('javascript:alert(1)')).toBeNull();
  });

  it('returns an explicit unavailable response for legacy detail', () => {
    const legacy = fixtureEvaluations.find((item) => !item.detailAvailable)!;
    expect(getFixtureEvaluation(legacy.repository.id, legacy.headSha)).toMatchObject({ status: 'unavailable', reason: 'LEGACY_RECORD' });
  });
});
