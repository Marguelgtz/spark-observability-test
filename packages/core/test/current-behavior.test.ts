import { describe, expect, it } from 'vitest';
import { evaluateChange } from '../src/evaluate';
import { currentBehaviorScenarios } from './fixtures/current-behavior';

describe('current evaluation behavior characterization', () => {
    for (const scenario of currentBehaviorScenarios) {
        it(scenario.name, () => {
            const evaluation = evaluateChange(scenario.input);

            expect({
                changeId: evaluation.changeId,
                attention: evaluation.attention,
                reasons: evaluation.reasons,
                directAreas: evaluation.directAreas,
                affectedAreas: evaluation.affectedAreas,
                sensitiveSurfaces: evaluation.sensitiveSurfaces,
                analysis: evaluation.analysis,
            }).toEqual(scenario.expected);
        });
    }
});
