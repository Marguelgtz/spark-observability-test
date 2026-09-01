import { describe, expect, it } from 'vitest';
import { projectProcessState } from '../src/understanding-projector';
import type { ProcessLifecycle, ProcessOutcome } from '../src/understanding';

describe('process observation semantics', () => {
    it.each([
        ['EXPECTED', 'UNKNOWN', 'MISSING'],
        ['NOT_OBSERVED', 'NOT_APPLICABLE', 'MISSING'],
        ['QUEUED', 'UNKNOWN', 'PENDING'],
        ['RUNNING', 'UNKNOWN', 'PENDING'],
        ['COMPLETED', 'PASSED', 'PASSED'],
        ['COMPLETED', 'FAILED', 'FAILED'],
        ['COMPLETED', 'NEUTRAL', 'UNKNOWN'],
        ['COMPLETED', 'SKIPPED', 'UNKNOWN'],
        ['COMPLETED', 'NOT_APPLICABLE', 'UNKNOWN'],
        ['CANCELLED', 'UNKNOWN', 'UNKNOWN'],
        ['UNKNOWN', 'UNKNOWN', 'UNKNOWN'],
    ] satisfies Array<[ProcessLifecycle, ProcessOutcome, string]>)('projects %s/%s to legacy %s', (lifecycle, outcome, status) => {
        expect(projectProcessState(lifecycle, outcome)).toBe(status);
    });

    it('does not let a premature outcome override a non-terminal lifecycle', () => {
        expect(projectProcessState('RUNNING', 'PASSED')).toBe('PENDING');
    });
});
