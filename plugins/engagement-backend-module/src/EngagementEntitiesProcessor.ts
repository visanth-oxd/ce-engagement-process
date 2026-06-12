import {
  CatalogProcessor,
  CatalogProcessorEmit,
  processingResult,
} from '@backstage/plugin-catalog-node';
import {
  Entity,
  parseEntityRef,
  getCompoundEntityRef,
  RELATION_OWNED_BY,
  RELATION_OWNER_OF,
  RELATION_DEPENDS_ON,
  RELATION_DEPENDENCY_OF,
  RELATION_PART_OF,
  RELATION_HAS_PART,
} from '@backstage/catalog-model';
import { LocationSpec } from '@backstage/plugin-catalog-common';
import {
  ENGAGEMENT_API_VERSION,
  ENGAGEMENT_KIND,
  EngagementEntityV1alpha1,
} from '@internal/plugin-engagement-common';

/**
 * Validates Engagement entities and emits relations so the engagement graph
 * is queryable with stock Backstage tooling:
 *
 *   engagement --ownedBy-->   group (Accountable per RACI)
 *   engagement --dependsOn--> resource (environment allocation; the
 *                              "who holds INT?" query is just reverse relations)
 *   engagement --dependsOn--> group (teams with open IAs)
 *   engagement --partOf-->    engagement (change to in-flight work)
 */
export class EngagementEntitiesProcessor implements CatalogProcessor {
  getProcessorName(): string {
    return 'EngagementEntitiesProcessor';
  }

  async validateEntityKind(entity: Entity): Promise<boolean> {
    return (
      entity.apiVersion === ENGAGEMENT_API_VERSION &&
      entity.kind === ENGAGEMENT_KIND
    );
  }

  async postProcessEntity(
    entity: Entity,
    _location: LocationSpec,
    emit: CatalogProcessorEmit,
  ): Promise<Entity> {
    if (entity.kind !== ENGAGEMENT_KIND) return entity;
    const engagement = entity as EngagementEntityV1alpha1;
    const selfRef = getCompoundEntityRef(entity);

    const relate = (
      targetRef: string,
      forward: string,
      reverse: string,
      defaultKind: string,
    ) => {
      const target = parseEntityRef(targetRef, {
        defaultKind,
        defaultNamespace: selfRef.namespace,
      });
      emit(processingResult.relation({ source: selfRef, type: forward, target }));
      emit(processingResult.relation({ source: target, type: reverse, target: selfRef }));
    };

    // Ownership (RACI Accountable for the current stage lives in docs; the
    // entity owner is the process owner — CE TPO — throughout intake).
    relate(engagement.spec.owner, RELATION_OWNED_BY, RELATION_OWNER_OF, 'Group');

    // Environment allocations → dependsOn. Released environments drop out of
    // the graph, which is exactly the contention view you want.
    for (const env of engagement.spec.environments ?? []) {
      if (env.status !== 'released') {
        relate(env.resource, RELATION_DEPENDS_ON, RELATION_DEPENDENCY_OF, 'Resource');
      }
    }

    // Teams with non-complete IAs → dependsOn (the engagement is blocked on them).
    for (const ia of engagement.spec.impactAssessments ?? []) {
      if (ia.status !== 'complete') {
        relate(ia.team, RELATION_DEPENDS_ON, RELATION_DEPENDENCY_OF, 'Group');
      }
    }

    // Change-to-in-flight-work → partOf parent engagement.
    if (engagement.spec.parent) {
      relate(engagement.spec.parent, RELATION_PART_OF, RELATION_HAS_PART, ENGAGEMENT_KIND);
    }

    return entity;
  }
}
