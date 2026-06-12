import { PIPELINE_STAGES, pipelineIndex, isClosed, iaProgress } from './stages';

describe('stage pipeline model', () => {
  it('orders the six pipeline stages to match the process docs', () => {
    expect(PIPELINE_STAGES.map(s => s.stage)).toEqual([
      'submitted',
      'internal-review',
      'triage',
      'ia-in-progress',
      'allocated',
      'interlocked',
    ]);
  });

  it('maps stages to pipeline indices', () => {
    expect(pipelineIndex('submitted')).toBe(0);
    expect(pipelineIndex('interlocked')).toBe(5);
    expect(pipelineIndex('closed')).toBe(PIPELINE_STAGES.length); // past the end
    expect(pipelineIndex('nonsense')).toBe(-1);
    expect(pipelineIndex(undefined)).toBe(-1);
  });

  it('treats closed as terminal, not a step', () => {
    expect(isClosed('closed')).toBe(true);
    expect(isClosed('triage')).toBe(false);
    expect(PIPELINE_STAGES.some(s => (s.stage as string) === 'closed')).toBe(false);
  });

  it('computes IA progress', () => {
    expect(iaProgress(undefined)).toEqual({ complete: 0, total: 0 });
    expect(
      iaProgress([
        { status: 'complete' },
        { status: 'in-progress' },
        { status: 'complete' },
      ]),
    ).toEqual({ complete: 2, total: 3 });
  });
});
