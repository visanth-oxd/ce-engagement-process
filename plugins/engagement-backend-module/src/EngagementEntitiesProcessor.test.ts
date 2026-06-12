import { EngagementEntitiesProcessor } from './EngagementEntitiesProcessor';

const LOCATION = { type: 'url', target: 'https://example.com' };

function makeEntity(spec: any) {
  return {
    apiVersion: 'ce.your-org.io/v1alpha1',
    kind: 'Engagement',
    metadata: { name: 'e1', namespace: 'default' },
    spec,
  } as any;
}

function emittedRelations(emit: jest.Mock) {
  return emit.mock.calls
    .map(c => c[0])
    .filter(r => r.type === 'relation')
    .map(r => ({
      type: r.relation.type,
      source: r.relation.source,
      target: r.relation.target,
    }));
}

describe('EngagementEntitiesProcessor', () => {
  const processor = new EngagementEntitiesProcessor();

  it('validates only the Engagement kind at the right apiVersion', async () => {
    expect(await processor.validateEntityKind(makeEntity({}))).toBe(true);
    expect(
      await processor.validateEntityKind({
        ...makeEntity({}),
        kind: 'Component',
      }),
    ).toBe(false);
  });

  it('emits ownership, environment, and IA relations', async () => {
    const emit = jest.fn();
    await processor.postProcessEntity(
      makeEntity({
        stage: 'ia-in-progress',
        owner: 'group:default/ce-tpo',
        environments: [
          { resource: 'resource:default/int-environment', status: 'allocated' },
          { resource: 'resource:default/pre-environment', status: 'released' },
        ],
        impactAssessments: [
          { team: 'group:default/payments-team', status: 'pending' },
          { team: 'group:default/platform-team', status: 'complete' },
        ],
      }),
      LOCATION,
      emit,
    );

    const rels = emittedRelations(emit);
    const dependsOnTargets = rels
      .filter(r => r.type === 'dependsOn')
      .map(r => `${r.target.kind}:${r.target.namespace}/${r.target.name}`.toLowerCase());

    // ownership
    expect(rels.some(r => r.type === 'ownedBy')).toBe(true);
    // allocated env in graph, released env dropped
    expect(dependsOnTargets).toContain('resource:default/int-environment');
    expect(dependsOnTargets).not.toContain('resource:default/pre-environment');
    // open IA in graph, complete IA dropped
    expect(dependsOnTargets).toContain('group:default/payments-team');
    expect(dependsOnTargets).not.toContain('group:default/platform-team');
  });

  it('emits partOf for change-to-in-flight engagements', async () => {
    const emit = jest.fn();
    await processor.postProcessEntity(
      makeEntity({
        stage: 'submitted',
        owner: 'group:default/ce-tpo',
        parent: 'engagement:default/parent-engagement',
      }),
      LOCATION,
      emit,
    );

    const rels = emittedRelations(emit);
    expect(rels.some(r => r.type === 'partOf')).toBe(true);
  });
});
