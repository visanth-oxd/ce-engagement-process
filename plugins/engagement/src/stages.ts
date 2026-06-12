import { EngagementStage } from '@internal/plugin-engagement-common';

/**
 * Presentation model for the stage pipeline. Pure data + functions so the
 * card's logic is unit-testable without rendering.
 *
 * 'closed' is terminal, not a pipeline step — it renders as a badge instead.
 */
export const PIPELINE_STAGES: ReadonlyArray<{
  stage: EngagementStage;
  label: string;
}> = [
  { stage: 'submitted', label: 'Submitted' },
  { stage: 'internal-review', label: 'Internal Review' },
  { stage: 'triage', label: 'Triage' },
  { stage: 'ia-in-progress', label: 'Impact Assessment' },
  { stage: 'allocated', label: 'Env Allocated' },
  { stage: 'interlocked', label: 'Interlocked' },
];

/** Index into PIPELINE_STAGES; closed maps past the end, unknown to -1. */
export function pipelineIndex(stage: string | undefined): number {
  if (stage === 'closed') return PIPELINE_STAGES.length;
  return PIPELINE_STAGES.findIndex(s => s.stage === stage);
}

export function isClosed(stage: string | undefined): boolean {
  return stage === 'closed';
}

export function iaProgress(
  ias: Array<{ status: string }> | undefined,
): { complete: number; total: number } {
  const total = ias?.length ?? 0;
  const complete = (ias ?? []).filter(ia => ia.status === 'complete').length;
  return { complete, total };
}
