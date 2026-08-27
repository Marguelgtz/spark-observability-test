import type { EvidenceSummaryV1 } from '@spark/dashboard-contracts';

export function shortSha(sha: string): string {
  return sha.slice(0, 8);
}

export function relativeTime(iso: string, now = Date.now()): string {
  const delta = Math.max(0, now - Date.parse(iso));
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function evidenceLabel(summary: EvidenceSummaryV1): string {
  if (summary.failed) return `${summary.failed} failed`;
  if (summary.missing) return `${summary.missing} missing`;
  if (summary.pending) return `${summary.pending} pending`;
  if (summary.unknown) return `${summary.unknown} unknown`;
  if (summary.passed) return `${summary.passed} passed`;
  return 'no evidence';
}

export function changeLabel(files: number, additions?: number, deletions?: number): string {
  const parts = [`${files} file${files === 1 ? '' : 's'}`];
  if (additions !== undefined && deletions !== undefined) parts.push(`+${additions}/-${deletions}`);
  return parts.join(' · ');
}

export function trustedGitHubUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') return null;
    return url;
  } catch {
    return null;
  }
}
