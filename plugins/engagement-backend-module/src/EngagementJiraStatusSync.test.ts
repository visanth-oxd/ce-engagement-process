import { EngagementJiraStatusSync } from './EngagementJiraStatusSync';
import { InMemoryStageStore } from './StageStore';
import { JiraClient } from './JiraClient';
import { StageWriter } from './RegistryStageWriter';

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(),
} as any;

function makeEntity(overrides: any = {}) {
  return {
    apiVersion: 'ce.your-org.io/v1alpha1',
    kind: 'Engagement',
    metadata: {
      name: 'acme-payments-q3',
      namespace: 'default',
      annotations: {
        'jira/issue-key': 'UNPL-1042',
        'jira/project-key': 'UNPL',
      },
      ...overrides.metadata,
    },
    spec: {
      stage: 'triage',
      client: 'ACME Retail',
      owner: 'group:default/ce-tpo',
      impactAssessments: [
        { team: 'group:default/payments-team', status: 'pending' },
        { team: 'group:default/platform-team', status: 'pending', jiraKey: 'UNPL-2' },
      ],
      ...overrides.spec,
    },
  };
}

function makeDeps(jiraStatus: string, entity = makeEntity()) {
  const jira: jest.Mocked<JiraClient> = {
    getIssueStatus: jest.fn().mockResolvedValue(jiraStatus),
    createIssue: jest.fn().mockResolvedValue('UNPL-99'),
    findIssueKeysByLabel: jest.fn().mockResolvedValue([]),
  };
  const stageWriter: jest.Mocked<StageWriter> = {
    applyStage: jest.fn().mockResolvedValue({}),
  };
  const notifications = { send: jest.fn().mockResolvedValue(undefined) };
  const catalog = {
    getEntities: jest.fn().mockResolvedValue({ items: [entity] }),
  };
  const stageStore = new InMemoryStageStore();
  const sync = new EngagementJiraStatusSync({
    logger,
    catalog: catalog as any,
    jira,
    notifications: notifications as any,
    stageStore,
    stageWriter,
    impactAssessment: { issueType: 'Task', labelPrefix: 'engagement-ia' },
  });
  return { sync, jira, stageWriter, notifications, stageStore };
}

describe('EngagementJiraStatusSync', () => {
  afterEach(() => jest.clearAllMocks());

  it('applies stage but does not notify on first sight of an entity', async () => {
    const { sync, stageWriter, notifications, stageStore } = makeDeps('Triage');
    await sync.run();

    expect(stageWriter.applyStage).toHaveBeenCalledWith(
      expect.objectContaining({ entityName: 'acme-payments-q3', stage: 'triage' }),
    );
    expect(notifications.send).not.toHaveBeenCalled();
    expect(await stageStore.get('engagement:default/acme-payments-q3')).toBe('triage');
  });

  it('notifies RACI parties on a transition', async () => {
    const { sync, notifications, stageStore } = makeDeps('Interlocked');
    await stageStore.set('engagement:default/acme-payments-q3', 'allocated');
    await sync.run();

    expect(notifications.send).toHaveBeenCalledTimes(1);
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        recipients: { type: 'entity', entityRef: 'group:default/release-management' },
      }),
    );
  });

  it('is a no-op when the stage is unchanged', async () => {
    const { sync, stageWriter, notifications, stageStore } = makeDeps('Triage');
    await stageStore.set('engagement:default/acme-payments-q3', 'triage');
    await sync.run();

    expect(stageWriter.applyStage).not.toHaveBeenCalled();
    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('creates IA tickets only for teams without one, on entry to ia-in-progress', async () => {
    const { sync, jira, stageWriter, stageStore } = makeDeps('IA In Progress');
    await stageStore.set('engagement:default/acme-payments-q3', 'triage');
    await sync.run();

    // payments-team has no jiraKey -> created; platform-team already has one.
    expect(jira.createIssue).toHaveBeenCalledTimes(1);
    expect(jira.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        projectKey: 'UNPL',
        issueType: 'Task',
        labels: expect.arrayContaining([
          'engagement-ia--acme-payments-q3--group-default-payments-team',
        ]),
      }),
    );
    // The new key rides along in the registry mutation.
    expect(stageWriter.applyStage).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'ia-in-progress',
        impactAssessmentKeys: { 'group:default/payments-team': 'UNPL-99' },
      }),
    );
  });

  it('reuses an existing IA ticket found by label instead of creating a duplicate', async () => {
    const { sync, jira, stageWriter, stageStore } = makeDeps('IA In Progress');
    jira.findIssueKeysByLabel.mockResolvedValue(['UNPL-77']);
    await stageStore.set('engagement:default/acme-payments-q3', 'triage');
    await sync.run();

    expect(jira.createIssue).not.toHaveBeenCalled();
    expect(stageWriter.applyStage).toHaveBeenCalledWith(
      expect.objectContaining({
        impactAssessmentKeys: { 'group:default/payments-team': 'UNPL-77' },
      }),
    );
  });

  it('notifies each IA team on transition to ia-in-progress', async () => {
    const { sync, notifications, stageStore } = makeDeps('IA In Progress');
    await stageStore.set('engagement:default/acme-payments-q3', 'triage');
    await sync.run();

    const recipients = notifications.send.mock.calls.map(
      c => c[0].recipients.entityRef,
    );
    expect(recipients).toEqual([
      'group:default/payments-team',
      'group:default/platform-team',
    ]);
  });

  it('skips unmapped Jira statuses without writing', async () => {
    const { sync, stageWriter } = makeDeps('Some Weird Status');
    await sync.run();
    expect(stageWriter.applyStage).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('does not persist the stage when applyStage throws (retried next tick)', async () => {
    const { sync, stageWriter, stageStore } = makeDeps('Triage');
    stageWriter.applyStage.mockRejectedValue(new Error('github down'));
    await sync.run();

    expect(await stageStore.get('engagement:default/acme-payments-q3')).toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});
