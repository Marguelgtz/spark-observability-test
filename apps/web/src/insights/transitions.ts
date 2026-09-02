import type { NotableTransitionKindV1 } from '@spark/dashboard-contracts';
import type { NotableTransitionInsightsV1 } from '../overview-api';
import type { InsightValue } from './throughput';

const TRANSITION_LABELS: Record<NotableTransitionKindV1, string> = {
  ATTENTION_INCREASED: 'Attention increased',
  ATTENTION_DECREASED: 'Attention decreased',
  EVIDENCE_REGRESSED: 'Evidence regressed',
  EVIDENCE_RECOVERED: 'Evidence recovered',
  EVIDENCE_BECAME_PENDING: 'Evidence pending / missing',
  EVIDENCE_RESOLVED: 'Evidence resolved',
  SENSITIVE_SURFACE_ADDED: 'Sensitive surface added',
  CHANGE_SCOPE_EXPANDED: 'Scope expanded',
};

export function transitionMix(insights: NotableTransitionInsightsV1, limit = 8): InsightValue[] {
  return insights.byKind
    .filter((item) => item.count > 0)
    .map((item) => ({ label: TRANSITION_LABELS[item.kind], value: item.count }))
    .sort((left, right) => right.value - left.value)
    .slice(0, limit);
}

export function transitionInterpretation(insights: NotableTransitionInsightsV1): string {
  return `${insights.total} notable transition${insights.total === 1 ? '' : 's'} across ${insights.affectedPRs} PR${insights.affectedPRs === 1 ? '' : 's'}`;
}
