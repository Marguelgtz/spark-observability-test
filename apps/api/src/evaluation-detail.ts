import type { SparkEvaluation, SparkInput } from '@spark/core';
import type { GitHubEvaluationSource } from '@spark/github';

export const EVALUATION_DETAIL_SCHEMA_VERSION = 1 as const;
export const EVALUATOR_VERSION = 'deterministic-v1';

const MAX_ARRAY_ITEMS = 500;
const MAX_TEXT_LENGTH = 2_000;

export interface EvaluationDetailTruncation {
  truncated: boolean;
  fields: string[];
}

export interface StoredEvaluationDetailV1 {
  version: 1;
  repository: {
    id: number;
    owner: string;
    name: string;
    fullName: string;
    url: string;
  };
  pullRequest: {
    number: number;
    title: string;
    url: string;
    state: string;
  };
  headSha: string;
  baseSha: string;
  evaluatedAt: string;
  evaluatorVersion: string;
  check: {
    id: number;
    url?: string;
  };
  input: SparkInput;
  evaluation: SparkEvaluation;
  profileProvenance?: {
    sourceSha?: string;
    version?: number;
  };
  truncation: EvaluationDetailTruncation;
}

function limitText(value: string, field: string, truncatedFields: string[]): string {
  if (value.length <= MAX_TEXT_LENGTH) return value;
  truncatedFields.push(field);
  return value.slice(0, MAX_TEXT_LENGTH);
}

function limitArray<T>(items: T[], field: string, truncatedFields: string[]): T[] {
  if (items.length <= MAX_ARRAY_ITEMS) return items;
  truncatedFields.push(field);
  return items.slice(0, MAX_ARRAY_ITEMS);
}

function boundedEvidence<T extends { name: string; kind: string; source: string }>(
  evidence: T[],
  field: string,
  truncatedFields: string[],
): T[] {
  return limitArray(evidence, field, truncatedFields).map((item, index) => ({
    ...item,
    name: limitText(item.name, `${field}[${index}].name`, truncatedFields),
    kind: limitText(item.kind, `${field}[${index}].kind`, truncatedFields),
    source: limitText(item.source, `${field}[${index}].source`, truncatedFields),
  }));
}

function boundedInput(input: SparkInput, truncatedFields: string[]): SparkInput {
  return {
    ...input,
    change: {
      ...input.change,
      files: limitArray(input.change.files, 'input.change.files', truncatedFields).map((file, index) => ({
        ...file,
        path: limitText(file.path, `input.change.files[${index}].path`, truncatedFields),
      })),
    },
    context: {
      projects: limitArray(input.context.projects, 'input.context.projects', truncatedFields).map((project, index) => ({
        ...project,
        name: limitText(project.name, `input.context.projects[${index}].name`, truncatedFields),
        path: limitText(project.path, `input.context.projects[${index}].path`, truncatedFields),
        dependencies: limitArray(project.dependencies, `input.context.projects[${index}].dependencies`, truncatedFields)
          .map((dependency, dependencyIndex) => limitText(
            dependency,
            `input.context.projects[${index}].dependencies[${dependencyIndex}]`,
            truncatedFields,
          )),
      })),
    },
    evidence: boundedEvidence(input.evidence, 'input.evidence', truncatedFields),
    analysis: input.analysis ? {
      ...input.analysis,
      notes: limitArray(input.analysis.notes, 'input.analysis.notes', truncatedFields)
        .map((note, index) => limitText(note, `input.analysis.notes[${index}]`, truncatedFields)),
    } : undefined,
  };
}

function boundedEvaluation(evaluation: SparkEvaluation, truncatedFields: string[]): SparkEvaluation {
  const boundStrings = (items: string[], field: string) => limitArray(items, field, truncatedFields)
    .map((value, index) => limitText(value, `${field}[${index}]`, truncatedFields));
  return {
    ...evaluation,
    reasons: boundStrings(evaluation.reasons, 'evaluation.reasons'),
    directAreas: boundStrings(evaluation.directAreas, 'evaluation.directAreas'),
    affectedAreas: boundStrings(evaluation.affectedAreas, 'evaluation.affectedAreas'),
    sensitiveSurfaces: boundStrings(evaluation.sensitiveSurfaces, 'evaluation.sensitiveSurfaces'),
    evidence: boundedEvidence(evaluation.evidence, 'evaluation.evidence', truncatedFields),
    analysis: evaluation.analysis ? {
      ...evaluation.analysis,
      notes: limitArray(evaluation.analysis.notes, 'evaluation.analysis.notes', truncatedFields)
        .map((note, index) => limitText(note, `evaluation.analysis.notes[${index}]`, truncatedFields)),
    } : undefined,
  };
}

export function buildStoredEvaluationDetail(
  source: GitHubEvaluationSource,
  evaluation: SparkEvaluation,
  check: { id: number; url?: string },
  evaluatedAt = new Date().toISOString(),
): StoredEvaluationDetailV1 {
  const truncatedFields: string[] = [];
  const [owner = '', name = source.repository.name] = source.repository.full_name.split('/');
  const input = boundedInput(source.input, truncatedFields);
  const bounded = boundedEvaluation(evaluation, truncatedFields);
  return {
    version: EVALUATION_DETAIL_SCHEMA_VERSION,
    repository: {
      id: source.repository.id,
      owner,
      name,
      fullName: source.repository.full_name,
      url: `https://github.com/${source.repository.full_name}`,
    },
    pullRequest: {
      number: source.pullRequest.number,
      title: limitText(source.pullRequest.title, 'pullRequest.title', truncatedFields),
      url: source.pullRequest.html_url,
      state: source.pullRequest.state,
    },
    headSha: source.pullRequest.head.sha,
    baseSha: source.pullRequest.base.sha,
    evaluatedAt,
    evaluatorVersion: EVALUATOR_VERSION,
    check,
    input,
    evaluation: bounded,
    truncation: {
      truncated: truncatedFields.length > 0,
      fields: truncatedFields,
    },
  };
}
