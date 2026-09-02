import { describe, expect, it } from 'vitest';
import { evaluateChange } from '../src/evaluate';
import { evaluateUnderstandingCompatibility } from '../src/understanding-projector';
import { currentBehaviorScenarios } from './fixtures/current-behavior';
import { legacyInputAsUnderstanding } from './fixtures/legacy-understanding';

describe('repository understanding compatibility parity', () => {
    for (const scenario of currentBehaviorScenarios) {
        it(scenario.name, () => {
            const current = evaluateChange(scenario.input);
            const projected = evaluateUnderstandingCompatibility(legacyInputAsUnderstanding(scenario.input));

            expect(projected).toEqual(current);
        });
    }
});
