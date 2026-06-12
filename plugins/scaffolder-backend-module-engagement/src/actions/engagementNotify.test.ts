import { createEngagementNotifyAction } from './engagementNotify';

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

describe('engagement:notify', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.clearAllMocks();
  });

  it('fans out one Backstage notification per recipient', async () => {
    const notifications = { send: jest.fn().mockResolvedValue(undefined) };
    const action = createEngagementNotifyAction({
      notifications: notifications as any,
    });

    await action.handler(
      makeCtx({
        recipients: ['group:default/ce-tpo', 'group:default/triage-board'],
        title: 'New engagement',
        message: 'Please review',
      }),
    );

    expect(notifications.send).toHaveBeenCalledTimes(2);
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        recipients: { type: 'entity', entityRef: 'group:default/ce-tpo' },
      }),
    );
  });

  it('mirrors to Slack only when both channel and webhook are configured', async () => {
    global.fetch = jest.fn(async () => ({ ok: true })) as any;
    const notifications = { send: jest.fn().mockResolvedValue(undefined) };

    // webhook configured + channel given -> posts
    await createEngagementNotifyAction({
      notifications: notifications as any,
      slackWebhookUrl: 'https://hooks.slack.example/x',
    }).handler(
      makeCtx({
        recipients: ['group:default/ce-tpo'],
        title: 't',
        message: 'm',
        slackChannel: '#ce-engagement-intake',
      }),
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // no webhook -> no post even with channel
    (global.fetch as jest.Mock).mockClear();
    await createEngagementNotifyAction({
      notifications: notifications as any,
    }).handler(
      makeCtx({
        recipients: ['group:default/ce-tpo'],
        title: 't',
        message: 'm',
        slackChannel: '#ce-engagement-intake',
      }),
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
