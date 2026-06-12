import { createBackendModule, coreServices } from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node/alpha';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { notificationService } from '@backstage/plugin-notifications-node';
import { EngagementEntitiesProcessor } from './EngagementEntitiesProcessor';
import { EngagementJiraStatusSync } from './EngagementJiraStatusSync';
import { createJiraClient } from './JiraClient';
import { DatabaseStageStore } from './StageStore';
import {
  GithubRegistryStageWriter,
  NoopStageWriter,
  StageWriter,
} from './RegistryStageWriter';

export const catalogModuleEngagement = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'engagement-kind',
  register(reg) {
    reg.registerInit({
      deps: {
        catalogProcessing: catalogProcessingExtensionPoint,
        catalog: catalogServiceRef,
        scheduler: coreServices.scheduler,
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        database: coreServices.database,
        notifications: notificationService,
      },
      async init({
        catalogProcessing,
        catalog,
        scheduler,
        logger,
        config,
        database,
        notifications,
      }) {
        catalogProcessing.addProcessor(new EngagementEntitiesProcessor());

        const jira = createJiraClient({
          baseUrl: config.getString('engagement.jira.baseUrl'),
          token: config.getString('engagement.jira.token'),
        });

        // Stage store is DB-backed so restarts don't re-fire notifications.
        const stageStore = await DatabaseStageStore.create(database);

        // Registry writer: bot PRs against the engagement-registry repo.
        // Without config it degrades to a logged no-op (file-based dev).
        const registry = config.getOptionalConfig('engagement.registry');
        const stageWriter: StageWriter = registry
          ? new GithubRegistryStageWriter(
              {
                apiBaseUrl: registry.getOptionalString('apiBaseUrl'),
                owner: registry.getString('owner'),
                repo: registry.getString('repo'),
                branch: registry.getOptionalString('branch'),
                token: registry.getString('token'),
              },
              logger,
            )
          : new NoopStageWriter(logger);

        const sync = new EngagementJiraStatusSync({
          logger,
          catalog: catalog as any,
          jira,
          notifications,
          stageStore,
          stageWriter,
          impactAssessment: {
            issueType:
              config.getOptionalString('engagement.jira.impactAssessment.issueType') ??
              'Task',
            labelPrefix:
              config.getOptionalString('engagement.jira.impactAssessment.labelPrefix') ??
              'engagement-ia',
          },
        });
        await EngagementJiraStatusSync.schedule(scheduler, sync);
      },
    });
  },
});
