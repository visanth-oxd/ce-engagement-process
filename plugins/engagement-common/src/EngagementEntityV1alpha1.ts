/**
 * @public
 * The Engagement custom entity kind, apiVersion ce.your-org.io/v1alpha1.
 *
 * Design constraints (deliberate):
 *  - `spec.stage` mirrors Jira and is written ONLY by EngagementJiraStatusProvider.
 *    The catalog is a read model of the workflow, never the state machine.
 *  - Relations to teams/environments are emitted by the processor so the graph
 *    ("which engagements hold INT?") is queryable via the standard relations API.
 */
import type { Entity } from '@backstage/catalog-model';

export const ENGAGEMENT_API_VERSION = 'ce.your-org.io/v1alpha1';
export const ENGAGEMENT_KIND = 'Engagement';

export type EngagementStage =
  | 'submitted'
  | 'internal-review'
  | 'triage'
  | 'ia-in-progress'
  | 'allocated'
  | 'interlocked'
  | 'closed';

// Type aliases (not interfaces) on purpose: aliases carry implicit index
// signatures, which keeps spec assignable to catalog-model's JsonObject.
export type ImpactAssessment = {
  /** Group entity ref, e.g. group:default/payments-team */
  team: string;
  status: 'pending' | 'in-progress' | 'complete';
  jiraKey?: string | null;
};

export type EnvironmentAllocation = {
  /** Resource entity ref, e.g. resource:default/int-environment */
  resource: string;
  status: 'requested' | 'allocated' | 'released';
};

export interface EngagementEntityV1alpha1 extends Entity {
  apiVersion: typeof ENGAGEMENT_API_VERSION;
  kind: typeof ENGAGEMENT_KIND;
  spec: {
    stage: EngagementStage;
    client: string;
    requestedBy: string;
    requestedDate: string;
    nftRequired?: boolean;
    owner: string;
    /** Parent engagement ref when this is a change to in-flight work */
    parent?: string;
    impactAssessments?: ImpactAssessment[];
    environments?: EnvironmentAllocation[];
  };
}

export const engagementEntityV1alpha1Schema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'EngagementEntityV1alpha1',
  type: 'object',
  allOf: [
    { $ref: 'Entity' },
    {
      type: 'object',
      required: ['spec'],
      properties: {
        apiVersion: { enum: [ENGAGEMENT_API_VERSION] },
        kind: { enum: [ENGAGEMENT_KIND] },
        spec: {
          type: 'object',
          required: ['stage', 'client', 'requestedBy', 'requestedDate', 'owner'],
          properties: {
            stage: {
              enum: [
                'submitted',
                'internal-review',
                'triage',
                'ia-in-progress',
                'allocated',
                'interlocked',
                'closed',
              ],
            },
            client: { type: 'string', minLength: 1 },
            requestedBy: { type: 'string', minLength: 1 },
            requestedDate: { type: 'string', format: 'date' },
            nftRequired: { type: 'boolean' },
            owner: { type: 'string', minLength: 1 },
            parent: { type: 'string' },
            impactAssessments: {
              type: 'array',
              items: {
                type: 'object',
                required: ['team', 'status'],
                properties: {
                  team: { type: 'string' },
                  status: { enum: ['pending', 'in-progress', 'complete'] },
                  jiraKey: { type: ['string', 'null'] },
                },
              },
            },
            environments: {
              type: 'array',
              items: {
                type: 'object',
                required: ['resource', 'status'],
                properties: {
                  resource: { type: 'string' },
                  status: { enum: ['requested', 'allocated', 'released'] },
                },
              },
            },
          },
        },
      },
    },
  ],
} as const;
