import { createJiraEngagementAction } from './jiraCreateEngagement';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

function makeCtx(input: any) {
  return {
    input,
    output: jest.fn(),
    logger,
    workspacePath: '/tmp',
    createTemporaryDirectory: jest.fn(),
  } as any;
}

describe('engagement:jira:create', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.clearAllMocks();
  });

  it('creates the issue and outputs the key', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ key: 'UNPL-1042' }),
    })) as any;

    const action = createJiraEngagementAction({
      baseUrl: 'https://jira.example.com',
      token: 't',
    });
    const ctx = makeCtx({
      projectKey: 'UNPL',
      issueType: 'Engagement Request',
      summary: '[ACME] payments uplift',
      description: 'details',
      labels: ['backstage-intake'],
    });

    await action.handler(ctx);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://jira.example.com/rest/api/3/issue');
    const body = JSON.parse(init.body);
    expect(body.fields.project.key).toBe('UNPL');
    expect(body.fields.issuetype.name).toBe('Engagement Request');
    expect(body.fields.labels).toEqual(['backstage-intake']);
    expect(ctx.output).toHaveBeenCalledWith('issueKey', 'UNPL-1042');
  });

  it('throws a descriptive error on Jira failure', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => 'bad token',
    })) as any;

    const action = createJiraEngagementAction({
      baseUrl: 'https://jira.example.com',
      token: 't',
    });
    await expect(
      action.handler(
        makeCtx({
          projectKey: 'UNPL',
          issueType: 'Engagement Request',
          summary: 's',
          description: 'd',
        }),
      ),
    ).rejects.toThrow(/401/);
  });
});
