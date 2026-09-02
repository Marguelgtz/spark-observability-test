import type { ActivityResponseV1, AttentionLevelV1 } from '@spark/dashboard-contracts';
import type { OverviewDrilldownResponseV1 } from '../overview-api';
import type { InsightValue } from './throughput';

export interface AttentionBucket {
  bucketStart: string;
  low: number;
  medium: number;
  high: number;
}

function bucketKey(value: Date, hourly: boolean): string {
  if (hourly) return `${value.toISOString().slice(0, 13)}:00:00Z`;
  return `${value.toISOString().slice(0, 10)}T00:00:00Z`;
}

export function currentAttentionMix(response: ActivityResponseV1): InsightValue[] {
  return [
    { label: 'HIGH', value: response.counts.HIGH, tone: 'high' },
    { label: 'MEDIUM', value: response.counts.MEDIUM, tone: 'medium' },
    { label: 'LOW', value: response.counts.LOW, tone: 'low' },
  ].filter((item) => item.value > 0);
}

export function evaluationAttentionMix(response: OverviewDrilldownResponseV1): InsightValue[] {
  const counts: Record<AttentionLevelV1, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  for (const item of response.items) {
    if (item.kind === 'evaluation') counts[item.evaluation.attention] += 1;
  }
  return [
    { label: 'HIGH', value: counts.HIGH, tone: 'high' },
    { label: 'MEDIUM', value: counts.MEDIUM, tone: 'medium' },
    { label: 'LOW', value: counts.LOW, tone: 'low' },
  ].filter((item) => item.value > 0);
}

export function evaluationAttentionTrend(response: OverviewDrilldownResponseV1): AttentionBucket[] {
  const hourly = response.selectedWindow === '24h';
  const points = new Map<string, AttentionBucket>();
  for (const point of response.trend) {
    points.set(point.bucketStart, { bucketStart: point.bucketStart, low: 0, medium: 0, high: 0 });
  }
  for (const item of response.items) {
    if (item.kind !== 'evaluation') continue;
    const key = bucketKey(new Date(item.evaluation.evaluatedAt), hourly);
    const point = points.get(key);
    if (!point) continue;
    if (item.evaluation.attention === 'HIGH') point.high += 1;
    else if (item.evaluation.attention === 'MEDIUM') point.medium += 1;
    else point.low += 1;
  }
  return [...points.values()];
}
