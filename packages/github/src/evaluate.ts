import type { SparkInput } from '@spark/core';
import type { GitHubApiClient } from './client';
import { normalizeChangedFiles, normalizeCheckRuns } from './normalize';
import { resolveRepositoryContext } from './repository';
import type { GitHubEvaluationSource } from './types';

export async function buildSparkInputFromPullRequest(
  client: GitHubApiClient,
  installationId: number,
  repositoryFullName: string,
  pullRequestNumber: number,
  expectedHeadSha: string,
  sparkAppId?: number,
): Promise<GitHubEvaluationSource | undefined> {
  const [owner, repo] = repositoryFullName.split('/');
  if (!owner || !repo) throw new Error('Invalid GitHub repository full name');
  const [repository, pullRequest] = await Promise.all([
    client.getRepository(owner, repo),
    client.getPullRequest(owner, repo, pullRequestNumber),
  ]);
  if (pullRequest.head.sha !== expectedHeadSha) return undefined;
  const [fileResult, checkRuns, context] = await Promise.all([
    client.listPullRequestFiles(owner, repo, pullRequestNumber, pullRequest.changed_files),
    client.listCheckRuns(owner, repo, expectedHeadSha),
    resolveRepositoryContext(client, owner, repo, expectedHeadSha),
  ]);
  const notes = [...context.notes];
  if (!fileResult.complete) notes.push(`GitHub exposed ${fileResult.files.length} of ${pullRequest.changed_files} changed files`);
  const input: SparkInput = {
    change: { id: expectedHeadSha, files: normalizeChangedFiles(fileResult.files) },
    context: { projects: context.projects },
    evidence: normalizeCheckRuns(checkRuns, sparkAppId),
    analysis: {
      changedFiles: fileResult.complete ? 'complete' : 'incomplete',
      repositoryContext: context.knowledge,
      notes,
    },
  };
  const existingSparkCheckRunId = checkRuns.find(check =>
    check.name === 'Spark Observability' && (sparkAppId === undefined || check.app?.id === sparkAppId),
  )?.id;
  return { installationId, repository, pullRequest, input, existingSparkCheckRunId };
}
