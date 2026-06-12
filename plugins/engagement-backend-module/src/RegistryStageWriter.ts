import { LoggerService } from '@backstage/backend-plugin-api';
import { EngagementStage } from '@internal/plugin-engagement-common';
import { parseDocument } from 'yaml';

/**
 * Writes stage (and IA ticket-key) mutations back to the engagement-registry
 * repo as bot pull requests.
 *
 * Why a PR and not a direct catalog write: the registry repo is the source of
 * truth for Engagement entities (GitOps). Mutating it via PR keeps the full
 * audit trail — who/what/when for every stage transition — with zero extra
 * storage. The catalog re-ingests on merge.
 */

export interface StageMutation {
  /** Entity metadata.name, e.g. acme-payments-q3 */
  entityName: string;
  stage: EngagementStage;
  /** team entityRef -> newly created IA Jira key, merged into spec.impactAssessments */
  impactAssessmentKeys?: Record<string, string>;
}

export interface StageWriter {
  /** Idempotent: re-applying the same mutation must not open duplicate PRs. */
  applyStage(mutation: StageMutation): Promise<{ prUrl?: string }>;
}

/** Used when engagement.registry is not configured (e.g. local file-based dev). */
export class NoopStageWriter implements StageWriter {
  constructor(private readonly logger: LoggerService) {}
  async applyStage(m: StageMutation): Promise<{ prUrl?: string }> {
    this.logger.warn(
      `engagement.registry not configured — stage update for ` +
        `${m.entityName} -> ${m.stage} NOT persisted to the registry repo`,
    );
    return {};
  }
}

export interface RegistryConfig {
  /** API base, default https://api.github.com (set for GHE) */
  apiBaseUrl?: string;
  owner: string;
  repo: string;
  /** default: main */
  branch?: string;
  /** token with contents:write + pull_requests:write on the registry repo */
  token: string;
  /** path template inside the repo; {name} is the entity name */
  pathTemplate?: string;
}

const DEFAULT_PATH_TEMPLATE = 'engagements/{name}/catalog-info.yaml';

export class GithubRegistryStageWriter implements StageWriter {
  private readonly api: string;
  private readonly base: string;
  private readonly pathTemplate: string;

  constructor(
    private readonly config: RegistryConfig,
    private readonly logger: LoggerService,
    /** injectable for tests */
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.api = (config.apiBaseUrl ?? 'https://api.github.com').replace(/\/$/, '');
    this.base = config.branch ?? 'main';
    this.pathTemplate = config.pathTemplate ?? DEFAULT_PATH_TEMPLATE;
  }

  async applyStage(mutation: StageMutation): Promise<{ prUrl?: string }> {
    const { entityName, stage } = mutation;
    const branch = `engagement-sync/${entityName}/${stage}`;

    // Idempotency gate: an open PR from this branch means the mutation is
    // already in flight — re-running the sync must be a no-op.
    const existing = await this.findOpenPr(branch);
    if (existing) {
      this.logger.info(`Stage PR already open for ${entityName} -> ${stage}: ${existing}`);
      return { prUrl: existing };
    }

    const path = this.pathTemplate.replace('{name}', entityName);
    const file = await this.getFile(path);
    const updated = this.mutateYaml(file.content, mutation);
    if (updated === null) {
      this.logger.info(`${entityName} already at stage ${stage}; nothing to write`);
      return {};
    }

    await this.createBranch(branch);
    await this.putFile(path, branch, file.sha, updated, `chore(${entityName}): stage -> ${stage} [engagement-sync]`);
    const prUrl = await this.openPr(branch, mutation);
    this.logger.info(`Opened stage PR for ${entityName} -> ${stage}: ${prUrl}`);
    return { prUrl };
  }

  /** Format-preserving YAML mutation; returns null when nothing changed. */
  private mutateYaml(yamlText: string, mutation: StageMutation): string | null {
    const doc = parseDocument(yamlText);
    let changed = false;

    if (doc.getIn(['spec', 'stage']) !== mutation.stage) {
      doc.setIn(['spec', 'stage'], mutation.stage);
      changed = true;
    }

    const keys = mutation.impactAssessmentKeys ?? {};
    if (Object.keys(keys).length > 0) {
      const ias = doc.getIn(['spec', 'impactAssessments']) as any;
      if (ias && typeof ias.items?.length === 'number') {
        for (let i = 0; i < ias.items.length; i++) {
          const team = doc.getIn(['spec', 'impactAssessments', i, 'team']) as string;
          const current = doc.getIn(['spec', 'impactAssessments', i, 'jiraKey']);
          if (keys[team] && current !== keys[team]) {
            doc.setIn(['spec', 'impactAssessments', i, 'jiraKey'], keys[team]);
            changed = true;
          }
        }
      }
    }

    return changed ? doc.toString() : null;
  }

  // --- GitHub REST helpers -------------------------------------------------

  private async gh(method: string, url: string, body?: unknown): Promise<any> {
    const res = await this.fetchFn(`${this.api}${url}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        Accept: 'application/vnd.github+json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new Error(`GitHub ${method} ${url} failed: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  private repoPath(suffix: string): string {
    return `/repos/${this.config.owner}/${this.config.repo}${suffix}`;
  }

  private async findOpenPr(branch: string): Promise<string | undefined> {
    const prs = await this.gh(
      'GET',
      this.repoPath(`/pulls?state=open&head=${encodeURIComponent(`${this.config.owner}:${branch}`)}`),
    );
    return prs[0]?.html_url;
  }

  private async getFile(path: string): Promise<{ sha: string; content: string }> {
    const body = await this.gh('GET', this.repoPath(`/contents/${path}?ref=${this.base}`));
    return {
      sha: body.sha,
      content: Buffer.from(body.content, 'base64').toString('utf8'),
    };
  }

  private async createBranch(branch: string): Promise<void> {
    const baseRef = await this.gh('GET', this.repoPath(`/git/ref/heads/${this.base}`));
    try {
      await this.gh('POST', this.repoPath('/git/refs'), {
        ref: `refs/heads/${branch}`,
        sha: baseRef.object.sha,
      });
    } catch (e) {
      // 422 = branch already exists (left over from a closed-unmerged PR).
      // Reset it to base so the new commit applies cleanly.
      await this.gh('PATCH', this.repoPath(`/git/refs/heads/${branch}`), {
        sha: baseRef.object.sha,
        force: true,
      });
    }
  }

  private async putFile(
    path: string,
    branch: string,
    sha: string,
    content: string,
    message: string,
  ): Promise<void> {
    await this.gh('PUT', this.repoPath(`/contents/${path}`), {
      message,
      branch,
      sha,
      content: Buffer.from(content, 'utf8').toString('base64'),
    });
  }

  private async openPr(branch: string, mutation: StageMutation): Promise<string> {
    const iaNote = Object.entries(mutation.impactAssessmentKeys ?? {})
      .map(([team, key]) => `- IA ticket \`${key}\` created for \`${team}\``)
      .join('\n');
    const pr = await this.gh('POST', this.repoPath('/pulls'), {
      title: `engagement-sync: ${mutation.entityName} -> ${mutation.stage}`,
      head: branch,
      base: this.base,
      body:
        `Automated stage mirror from Jira (one-way sync).\n\n` +
        `- \`spec.stage\` -> \`${mutation.stage}\`\n` +
        (iaNote ? `${iaNote}\n` : '') +
        `\nOpened by EngagementJiraStatusSync. Jira remains the state machine.`,
    });
    return pr.html_url;
  }
}
