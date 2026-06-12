# Placeholders to replace at install time

This repo intentionally ships with placeholder values so it can be reviewed
and tested standalone. Replace **all** of the following before rolling out.
Nothing else in the repo is environment-specific.

| Placeholder | Where | Replace with |
|---|---|---|
| `your-org` (GitHub owner) | `templates/inbound-engagement/template.yaml` (`repoUrl`), `app-config.engagement.yaml` (`engagement.registry.owner`) | Your GitHub org |
| `ce.your-org.io/v1alpha1` (apiVersion) | `plugins/engagement-common/src/EngagementEntityV1alpha1.ts`, `catalog/engagements/*.yaml`, `templates/inbound-engagement/skeleton/catalog-info.yaml` | `ce.<your-domain>/v1alpha1` — change in the common package first; the constant is imported everywhere else in code, but YAML files must be updated by hand |
| `engagement-registry` (repo name) | `template.yaml` (`repoUrl`), `app-config.engagement.yaml` (`engagement.registry.repo`), README | Your registry repo name, if different |
| `https://your-jira.atlassian.net` | `app-config.engagement.yaml` (`engagement.jira.baseUrl`) | Your Jira base URL |
| `UNPL` (Jira project key) | `template.yaml` (jira create step), `catalog/engagements/acme-payments-q3.yaml` annotations, `docs/docs/process.md` | Your unplanned-work project key |
| Group names in `catalog/groups.yaml` (`ce-tpo`, `triage-board`, `sre-run`, `nft`, `release-management`) | `catalog/groups.yaml`, `STAGE_NOTIFICATIONS` in `EngagementJiraStatusSync.ts` | Real groups with real members — notifications go nowhere otherwise |
| `${JIRA_API_TOKEN}` | env var | Jira API token for the Backstage service account |
| `${GITHUB_REGISTRY_TOKEN}` | env var | Token with `contents:write` + `pull_requests:write` on the registry repo (fine-grained PAT or GitHub App token) |
| `${SLACK_ENGAGEMENT_WEBHOOK}` | env var (optional) | Incoming-webhook URL for the intake channel; omit to disable the Slack mirror |
| `Engagement Request` / `Task` (Jira issue types) | `template.yaml`, `engagement.jira.impactAssessment.issueType` | Issue types that exist in your Jira project |
| Jira workflow statuses (`Submitted`, `Internal Review`, `Triage`, `IA In Progress`, `Environment Allocated`, `Interlocked`, `Closed`) | `JIRA_STATUS_TO_STAGE` in `EngagementJiraStatusSync.ts` must match your Jira workflow exactly | Your workflow status names |
| `catalog.locations` file paths | `app-config.engagement.yaml` | In production, swap file locations for the registry-repo `url` location (commented example in the file) |

Sanity check after substitution:

1. `npm run verify` still passes (nothing here is covered by placeholders, but cheap to confirm).
2. Run the intake template end-to-end in a sandbox Backstage: ticket lands in Jira, PR lands in the registry repo, entity appears in the catalog.
3. Move the Jira ticket through one transition and confirm the sync opens a
   `engagement-sync/<name>/<stage>` PR and the RACI notification arrives.
