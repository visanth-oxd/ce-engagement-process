import { createTemplateAction } from '@backstage/plugin-scaffolder-node';

/**
 * engagement:jira:create
 * Creates the intake ticket on the Unplanned board. Output: { issueKey }.
 */
export const createJiraEngagementAction = (opts: {
  baseUrl: string;
  token: string;
}) =>
  createTemplateAction<{
    projectKey: string;
    issueType: string;
    summary: string;
    description: string;
    labels?: string[];
  }>({
    id: 'engagement:jira:create',
    description: 'Creates an engagement request ticket on the Jira Unplanned board',
    schema: {
      input: {
        required: ['projectKey', 'issueType', 'summary', 'description'],
        type: 'object',
        properties: {
          projectKey: { type: 'string' },
          issueType: { type: 'string' },
          summary: { type: 'string' },
          description: { type: 'string' },
          labels: { type: 'array', items: { type: 'string' } },
        },
      },
      output: {
        type: 'object',
        properties: { issueKey: { type: 'string' } },
      },
    },
    async handler(ctx) {
      const res = await fetch(`${opts.baseUrl}/rest/api/3/issue`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            project: { key: ctx.input.projectKey },
            issuetype: { name: ctx.input.issueType },
            summary: ctx.input.summary,
            labels: ctx.input.labels ?? [],
            description: {
              type: 'doc',
              version: 1,
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: ctx.input.description }],
                },
              ],
            },
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`Jira issue creation failed: ${res.status} ${await res.text()}`);
      }
      const body = await res.json();
      ctx.logger.info(`Created ${body.key} on ${ctx.input.projectKey}`);
      ctx.output('issueKey', body.key);
    },
  });
