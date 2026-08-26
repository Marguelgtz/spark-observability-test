import type { SparkEvaluation } from '@spark/core';
import type { CheckRunPayload } from './types';

function section(title: string, values: string[], empty: string): string {
  const displayed = values.slice(0, 30);
  const suffix = values.length > displayed.length ? [`…and ${values.length - displayed.length} more`] : [];
  return `### ${title}\n${[...displayed, ...suffix].map(value => `- ${value}`).join('\n') || `- ${empty}`}`;
}

export function formatSparkCheck(evaluation: SparkEvaluation, includeHeadSha = true): CheckRunPayload {
  const evidence = evaluation.evidence.map(item => {
    const mark = item.status === 'PASSED' ? '✓' : item.status === 'FAILED' ? '✗' : '?';
    const coverage = item.coverage === 'UNKNOWN' || item.coverage === undefined ? ' — project coverage unknown' : '';
    return `${mark} ${item.name} (${item.status})${coverage}`;
  });
  const analysisNotes = evaluation.analysis?.notes ?? [];
  const summary = [
    '## SPARK OBSERVABILITY',
    '',
    `**Attention: ${evaluation.attention}**`,
    '',
    section('Directly changed', evaluation.directAreas, 'none'),
    '',
    section('Potentially affected', evaluation.affectedAreas, evaluation.analysis?.repositoryContext === 'unknown' ? 'unknown' : 'none'),
    '',
    section('Evidence', evidence, 'no GitHub checks or statuses observed'),
    '',
    section('Sensitive surfaces', evaluation.sensitiveSurfaces, 'none'),
    '',
    section('Why', evaluation.reasons, 'none'),
    ...(analysisNotes.length ? ['', section('Analysis limits', analysisNotes, 'none')] : []),
    ...(includeHeadSha ? ['', `Evaluated commit: \`${evaluation.changeId}\``] : []),
    '',
    '_Observe mode: this neutral check reports attention and does not block merging._',
  ].join('\n');
  return {
    name: 'Spark Observability',
    status: 'completed',
    conclusion: 'neutral',
    output: { title: `Attention: ${evaluation.attention}`, summary: summary.slice(0, 65_535) },
  };
}
