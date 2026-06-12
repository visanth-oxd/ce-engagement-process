import { LoggerService, SchedulerService } from '@backstage/backend-plugin-api';
import { CatalogClient } from '@backstage/catalog-client';
import { NotificationService } from '@backstage/plugin-notifications-node';
import { EngagementStage } from '@internal/plugin-engagement-common';
import { JiraClient } from './JiraClient';
import { StageStore } from './StageStore';
import { StageWriter } from './RegistryStageWriter';

/**
 * Mirrors Jira workflow status into Engagement.spec.stage on a schedule,
 * and fires RACI notifications on transitions.
 *
 * Jira remains the state machine; this is one-way sync (Jira → catalog).
 * Writing the other direction would create a split-brain workflow — don't.
 *
 * Per-entity pipeline on each tick:
 *   1. read Jira status, map to stage
 *   2. if changed vs StageStore (DB-backed):
 *      a. on entry to ia-in-progress: ensure IA Jira tickets exist (idempotent
 *         via Jira label search)
 *      b. applyStage: bot PR against the registry repo mutating spec.stage
 *         (+ any new IA keys) — idempotent via open-PR check
 *      c. fire RACI notifications (skipped on first sight of an entity)
 *      d. persist new stage
 *   Failure at any step is logged and retried next tick; a/b are idempotent,
 *   c can at worst duplicate a notification after a partial failure.
 */
const JIRA_STATUS_TO_STAGE: Record<string, EngagementStage> = {
  'Submitted': 'submitted',
  'Internal Review': 'internal-review',
  'Triage': 'triage',
  'IA In Progress': 'ia-in-progress',
  'Environment Allocated': 'allocated',
  'Interlocked': 'interlocked',
  'Closed': 'closed',
  'Done': 'closed',
};

/** RACI "Informed" routing per stage transition. */
const STAGE_NOTIFICATIONS: Partial<
  Record<EngagementStage, { recipients: string[]; message: string }>
> = {
  'triage': {
    recipients: ['group:default/triage-board'],
    message: 'Engagement presented for weekly triage.',
  },
  'ia-in-progress': {
    recipients: [], // resolved dynamically: each team in spec.impactAssessments
    message: 'Impact assessment requested from your team.',
  },
  'allocated': {
    recipients: ['group:default/sre-run', 'group:default/nft'],
    message: 'Environment allocated — SRE/Run and NFT informed per RACI.',
  },
  'interlocked': {
    recipients: ['group:default/release-management'],
    message: 'Engagement interlocked — handed to Release Management for scheduling.',
  },
};

export interface ImpactAssessmentOptions {
  /** Jira issue type for IA tickets, e.g. 'Task' */
  issueType: string;
  /** label prefix for idempotency lookups */
  labelPrefix: string;
}

export class EngagementJiraStatusSync {
  constructor(
    private readonly deps: {
      logger: LoggerService;
      catalog: CatalogClient;
      jira: JiraClient;
      notifications: NotificationService;
      /** persists last-seen stage per entity to detect transitions (DB-backed) */
      stageStore: StageStore;
      /** lands spec.stage mutations as bot PRs on the registry repo */
      stageWriter: StageWriter;
      impactAssessment?: ImpactAssessmentOptions;
    },
  ) {}

  static schedule(scheduler: SchedulerService, sync: EngagementJiraStatusSync) {
    return scheduler.scheduleTask({
      id: 'engagement-jira-status-sync',
      frequency: { minutes: 5 },
      timeout: { minutes: 2 },
      fn: () => sync.run(),
    });
  }

  async run(): Promise<void> {
    const { catalog, jira, logger } = this.deps;
    const { items } = await catalog.getEntities({
      filter: { kind: 'Engagement' },
    });

    for (const entity of items) {
      const issueKey = entity.metadata.annotations?.['jira/issue-key'];
      if (!issueKey) continue;

      const ref = `engagement:${entity.metadata.namespace ?? 'default'}/${entity.metadata.name}`;
      try {
        const jiraStatus = await jira.getIssueStatus(issueKey);
        const stage = JIRA_STATUS_TO_STAGE[jiraStatus];
        if (!stage) {
          logger.warn(`Unmapped Jira status "${jiraStatus}" on ${issueKey}`);
          continue;
        }

        const previous = await this.deps.stageStore.get(ref);
        if (previous !== stage) {
          // IA tickets are cut on entry to ia-in-progress, before the registry
          // PR, so the new keys land in the same mutation.
          const iaKeys =
            stage === 'ia-in-progress'
              ? await this.ensureImpactAssessmentIssues(entity, issueKey)
              : undefined;

          await this.deps.stageWriter.applyStage({
            entityName: entity.metadata.name,
            stage,
            impactAssessmentKeys: iaKeys,
          });

          if (previous !== undefined) {
            await this.notifyTransition(entity, ref, stage);
          }
          await this.deps.stageStore.set(ref, stage);
        }
      } catch (e) {
        logger.error(`Stage sync failed for ${ref} (${issueKey})`, e as Error);
      }
    }
  }

  /**
   * Cuts one Jira ticket per team in spec.impactAssessments that doesn't have
   * one yet. Idempotent: each ticket carries a deterministic label
   * `<prefix>--<engagement>--<team>`; an existing match short-circuits
   * creation, so a crash between create and registry-PR cannot duplicate.
   * Returns team -> issue key for keys not yet recorded on the entity.
   */
  private async ensureImpactAssessmentIssues(
    entity: any,
    parentIssueKey: string,
  ): Promise<Record<string, string> | undefined> {
    const opts = this.deps.impactAssessment;
    if (!opts) return undefined;

    const ias: Array<{ team: string; status: string; jiraKey?: string | null }> =
      entity.spec?.impactAssessments ?? [];
    const projectKey =
      entity.metadata.annotations?.['jira/project-key'] ??
      parentIssueKey.split('-')[0];

    const created: Record<string, string> = {};
    for (const ia of ias) {
      if (ia.jiraKey) continue;

      const label = this.iaLabel(opts.labelPrefix, entity.metadata.name, ia.team);
      const existing = await this.deps.jira.findIssueKeysByLabel(label);
      if (existing.length > 0) {
        created[ia.team] = existing[0];
        continue;
      }

      const key = await this.deps.jira.createIssue({
        projectKey,
        issueType: opts.issueType,
        summary: `[IA] ${entity.spec?.client ?? entity.metadata.name} — ${ia.team}`,
        description:
          `Impact assessment for engagement ${entity.metadata.name} ` +
          `(parent ticket ${parentIssueKey}). Assess impact on your team's ` +
          `components and respond per the engagement process.`,
        labels: [label, 'engagement-ia'],
      });
      created[ia.team] = key;
      this.deps.logger.info(
        `Created IA ticket ${key} for ${ia.team} on ${entity.metadata.name}`,
      );
    }

    return Object.keys(created).length > 0 ? created : undefined;
  }

  private iaLabel(prefix: string, entityName: string, teamRef: string): string {
    const sanitize = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '-');
    return `${prefix}--${sanitize(entityName)}--${sanitize(teamRef)}`;
  }

  private async notifyTransition(entity: any, ref: string, stage: EngagementStage) {
    const rule = STAGE_NOTIFICATIONS[stage];
    if (!rule) return;

    const recipients =
      stage === 'ia-in-progress'
        ? (entity.spec?.impactAssessments ?? []).map((ia: any) => ia.team)
        : rule.recipients;

    for (const recipient of recipients) {
      await this.deps.notifications.send({
        recipients: { type: 'entity', entityRef: recipient },
        payload: {
          title: `[${entity.spec?.client}] ${entity.metadata.title ?? entity.metadata.name}`,
          description: rule.message,
          link: `/catalog/default/engagement/${entity.metadata.name}`,
          severity: 'normal',
          topic: 'engagement-process',
        },
      });
    }
    this.deps.logger.info(`Notified ${recipients.length} recipients for ${ref} -> ${stage}`);
  }
}
