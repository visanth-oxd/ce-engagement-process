import { createBackendModule, coreServices } from '@backstage/backend-plugin-api';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node/alpha';
import { notificationService } from '@backstage/plugin-notifications-node';
import { createJiraEngagementAction } from './actions/jiraCreateEngagement';
import { createEngagementNotifyAction } from './actions/engagementNotify';

export const scaffolderModuleEngagement = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'engagement-actions',
  register(reg) {
    reg.registerInit({
      deps: {
        scaffolder: scaffolderActionsExtensionPoint,
        config: coreServices.rootConfig,
        notifications: notificationService,
      },
      async init({ scaffolder, config, notifications }) {
        scaffolder.addActions(
          createJiraEngagementAction({
            baseUrl: config.getString('engagement.jira.baseUrl'),
            token: config.getString('engagement.jira.token'),
          }),
          createEngagementNotifyAction({
            notifications,
            slackWebhookUrl: config.getOptionalString('engagement.slack.webhookUrl'),
          }),
        );
      },
    });
  },
});
