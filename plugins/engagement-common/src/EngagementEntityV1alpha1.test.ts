import {
  ENGAGEMENT_API_VERSION,
  ENGAGEMENT_KIND,
  engagementEntityV1alpha1Schema,
} from './EngagementEntityV1alpha1';

describe('Engagement entity contract', () => {
  it('pins the kind and apiVersion the processor validates against', () => {
    expect(ENGAGEMENT_KIND).toBe('Engagement');
    expect(ENGAGEMENT_API_VERSION).toMatch(/\/v1alpha1$/);
  });

  it('schema stage enum matches the EngagementStage union and Jira mapping', () => {
    const spec: any = (engagementEntityV1alpha1Schema.allOf[1] as any).properties
      .spec;
    expect(spec.properties.stage.enum).toEqual([
      'submitted',
      'internal-review',
      'triage',
      'ia-in-progress',
      'allocated',
      'interlocked',
      'closed',
    ]);
    expect(spec.required).toEqual(
      expect.arrayContaining(['stage', 'client', 'requestedBy', 'requestedDate', 'owner']),
    );
  });
});
