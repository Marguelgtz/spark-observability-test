import type { ChangedFile, Evidence, EvidenceStatus } from '@spark/core';
import type { GitHubCheckRun, GitHubPullRequestFile } from './types';

export function normalizeChangedFiles(files: GitHubPullRequestFile[]): ChangedFile[] {
  return files.map(file => ({
    path: file.filename,
    status: file.status === 'removed' ? 'deleted' : file.status === 'added' || file.status === 'copied' ? 'added' : 'modified',
  }));
}

export function normalizeCheckStatus(check: Pick<GitHubCheckRun, 'status' | 'conclusion'>): EvidenceStatus {
  if (check.status !== 'completed') return 'PENDING';
  if (check.conclusion === 'success') return 'PASSED';
  if (['failure', 'timed_out', 'action_required', 'startup_failure'].includes(check.conclusion ?? '')) return 'FAILED';
  return 'UNKNOWN';
}

export function normalizeCheckRuns(checks: GitHubCheckRun[], sparkAppId?: number): Evidence[] {
  return checks
    .filter(check => !(check.name === 'Spark Observability' && (sparkAppId === undefined || check.app?.id === sparkAppId)))
    .map(check => ({
      name: check.name,
      kind: 'check-run',
      status: normalizeCheckStatus(check),
      source: check.app?.slug ?? check.app?.name ?? 'github-checks',
      knowledge: 'observed',
      coverage: 'UNKNOWN',
      url: check.details_url ?? check.html_url,
    }));
}
