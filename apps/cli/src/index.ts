import { evaluateChange, SparkInput, Project } from '@spark/core';

// Fixture Data
const baseProjects: Project[] = [
    { name: 'apps/web', path: 'apps/web', dependencies: ['packages/core-types', 'packages/logger'] },
    { name: 'apps/billing', path: 'apps/billing', dependencies: ['packages/core-types', 'packages/logger'] },
    { name: 'packages/checkout', path: 'packages/checkout', dependencies: ['packages/core-types', 'packages/logger'] },
    { name: 'packages/core-types', path: 'packages/core-types', dependencies: [] },
    { name: 'packages/logger', path: 'packages/logger', dependencies: [] },
];

const fixtures: Record<string, SparkInput> = {
    'shared-contract': {
        change: {
            id: 'fix-1',
            files: [
                { path: 'packages/core-types/src/index.ts', status: 'modified' },
                { path: 'packages/checkout/src/api.ts', status: 'modified' }
            ]
        },
        context: { projects: baseProjects },
        evidence: [
            { name: 'build', kind: 'build', status: 'PASSED', source: 'github', knowledge: 'observed', coverage: ['packages/core-types', 'packages/checkout'] },
            { name: 'unit', kind: 'test', status: 'PASSED', source: 'github', knowledge: 'observed', coverage: ['packages/checkout'] },
            { name: 'web-integration', kind: 'test', status: 'PASSED', source: 'github', knowledge: 'observed', coverage: 'UNKNOWN' },
        ]
    }
};

function main() {
    const fixtureName = process.argv[2] || 'shared-contract';
    const fixture = fixtures[fixtureName];

    if (!fixture) {
        console.error(`Fixture "${fixtureName}" not found.`);
        process.exit(1);
    }

    const result = evaluateChange(fixture);

    console.log(`\nSpark Evaluation\n`);
    console.log(`Attention: ${result.attention}\n`);

    console.log(`Directly changed`);
    if (result.directAreas.length === 0) console.log(`- none`);
    result.directAreas.forEach(a => console.log(`- ${a}`));
    console.log();

    console.log(`Potentially affected`);
    if (result.affectedAreas.length === 0) console.log(`- none`);
    result.affectedAreas.forEach(a => console.log(`- ${a}`));
    console.log();

    console.log(`Evidence`);
    if (result.evidence.length === 0) console.log(`- none`);
    result.evidence.forEach(e => {
        const mark = e.status === 'PASSED' ? '✓' : e.status === 'FAILED' ? '✗' : '?';
        console.log(`${mark} ${e.name} (${e.status})`);
    });
    console.log();

    console.log(`Sensitive surfaces`);
    if (result.sensitiveSurfaces.length === 0) console.log(`- none`);
    result.sensitiveSurfaces.forEach(s => console.log(`- ${s}`));
    console.log();

    console.log(`Why`);
    result.reasons.forEach(r => console.log(`- ${r}`));
    console.log();
}

main();
