import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { NotificationService } from '@backstage/plugin-notifications-node';

/**
 * engagement:notify
 * Sends Backstage notifications to group entity refs and optionally mirrors
 * to a Slack channel. Used for the RACI Informed/Consulted fan-out.
 */
export const createEngagementNotifyAction = (opts: {
  notifications: NotificationService;
  slackWebhookUrl?: string;
}) =>
  createTemplateAction<{
    recipients: string[];
    title: string;
    message: string;
    severity?: 'low' | 'normal' | 'high' | 'critical';
    slackChannel?: string;
  }>({
    id: 'engagement:notify',
    description: 'Notifies RACI parties via Backstage notifications and optionally Slack',
    schema: {
      input: {
        required: ['recipients', 'title', 'message'],
        type: 'object',
        properties: {
          recipients: { type: 'array', items: { type: 'string' } },
          title: { type: 'string' },
          message: { type: 'string' },
          severity: { type: 'string' },
          slackChannel: { type: 'string' },
        },
      },
    },
    async handler(ctx) {
      for (const recipient of ctx.input.recipients) {
        await opts.notifications.send({
          recipients: { type: 'entity', entityRef: recipient },
          payload: {
            title: ctx.input.title,
            description: ctx.input.message,
            severity: (ctx.input.severity ?? 'normal') as any,
            topic: 'engagement-process',
          },
        });
      }

      if (ctx.input.slackChannel && opts.slackWebhookUrl) {
        await fetch(opts.slackWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: ctx.input.slackChannel,
            text: `*${ctx.input.title}*\n${ctx.input.message}`,
          }),
        });
      }

      ctx.logger.info(`Notified ${ctx.input.recipients.length} recipients`);
    },
  });
