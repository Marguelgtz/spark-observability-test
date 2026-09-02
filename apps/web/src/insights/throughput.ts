import type { ActivityOverviewV1 } from '@spark/dashboard-contracts';
import type { OverviewDrilldownResponseV1 } from '../overview-api';

export interface InsightValue {
  label: string;
  value: number;
  tone?: string;
}

export interface IterationInsight {
  totalEvaluations: number;
  observedPRs: number;
  evaluationsPerPR: number;
  histogram: InsightValue[];
  sampled: boolean;
}

function histogramBucket(count: number): string {
  if (count <= 1) return '1';
  if (count <= 3) return '2–3';
  if (count <= 6) return '4–6';
  if (count <= 10) return '7–10';
  if (count <= 20) return '11–20';
  return '20+';
}

const HISTOGRAM_ORDER = ['1', '2–3', '4–6', '7–10', '11–20', '20+'];

export function deriveIterationInsight(
  evaluations: OverviewDrilldownResponseV1,
  exact?: Pick<ActivityOverviewV1, 'observedPRs' | 'totalEvaluations'>,
  exactObservedPRs?: number,
): IterationInsight {
  const counts = new Map<string, number>();
  for (const item of evaluations.items) {
    if (item.kind !== 'evaluation') continue;
    const key = `${item.evaluation.repository.id}:${item.evaluation.pullRequest.number}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const buckets = new Map(HISTOGRAM_ORDER.map((label) => [label, 0]));
  for (const count of counts.values()) {
    const label = histogramBucket(count);
    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  }

  const totalEvaluations = exact?.totalEvaluations ?? evaluations.total;
  const observedPRs = exact?.observedPRs ?? exactObservedPRs ?? counts.size;
  return {
    totalEvaluations,
    observedPRs,
    evaluationsPerPR: observedPRs > 0 ? totalEvaluations / observedPRs : 0,
    histogram: HISTOGRAM_ORDER.map((label) => ({ label, value: buckets.get(label) ?? 0 })),
    sampled: evaluations.truncated,
  };
}

export function iterationInterpretation(insight: IterationInsight): string {
  const density = insight.evaluationsPerPR.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return `${insight.totalEvaluations} evaluations across ${insight.observedPRs} PR${insight.observedPRs === 1 ? '' : 's'} · ${density} evaluations per PR`;
}
