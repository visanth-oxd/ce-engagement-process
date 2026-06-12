# Backstage Inbound Engagement Process

Complete implementation of the inbound engagement process in Backstage:
intake → internal review → weekly triage → impact assessments → environment
allocation → interlock → handoff to Release Management, with the RACI encoded
as automated notifications.

## Architecture

```
┌─────────────┐   scaffolder    ┌──────────────┐   one-way sync   ┌──────────┐
│  Requester  │ ──template────▶ │ Jira (UNPL)  │ ◀── status ───── │ Triage / │
└─────────────┘       │         │ state machine│      reads       │ teams    │
                      │         └──────┬───────┘                  └──────────┘
                      ▼                │ EngagementJiraStatusSync (5 min)
              ┌───────────────┐        ▼
              │ engagement-   │  ┌────────────────────────────────┐
              │ registry repo │─▶│ Catalog: Engagement entities    │
              │ (GitOps)      │  │  - relations to Groups (RACI)   │
              └───────────────┘  │  - dependsOn BLD/INT/PRE        │
                                 │  - notifications on transitions │
                                 └────────────────────────────────┘
```

Three deliberate decisions, worth defending in review:

1. **Jira stays the state machine.** `spec.stage` is a mirror, synced one-way.
   Two writable state stores for one workflow is a split-brain bug factory.
2. **Engagements are GitOps entities.** Created via PR by the scaffolder,
   mutated via bot PR by the sync — full audit trail for free, no new database.
3. **RACI "Informed" is code, not prose.** `STAGE_NOTIFICATIONS` in
   `EngagementJiraStatusSync.ts` *is* the notification column of the RACI.
   Process change = pull request.

## Layout

| Path | What |
|---|---|
| `templates/inbound-engagement/` | Scaffolder template (the front door) + entity/docs skeleton |
| `catalog/groups.yaml` | RACI parties as Groups (CE TPO, Triage Board, SRE/Run, NFT, Release Mgmt) |
| `catalog/environments.yaml` | BLD / INT / PRE as Resources |
| `catalog/engagements/` | Worked example Engagement entity |
| `plugins/engagement-common/` | `Engagement` kind: types + JSON schema |
| `plugins/engagement-backend-module/` | Catalog processor (validation + relations), Jira→stage sync, DB-backed stage store, registry bot-PR writer, IA ticket automation |
| `plugins/scaffolder-backend-module-engagement/` | Custom actions: `engagement:jira:create`, `engagement:notify` |
| `plugins/engagement/` | Frontend plugin: `EntityEngagementCard` stage pipeline for the entity page |
| `PLACEHOLDERS.md` | **Every placeholder value to replace at install time** |
| `docs/` | Process TechDocs: principles, Mermaid flow, RACI, triage guide |
| `app-config.engagement.yaml` | Config to merge (catalog rules, Jira creds, locations) |

## Installation

1. Copy `plugins/*` into your Backstage workspace `plugins/` and add the three
   packages to the yarn workspace.
2. Wire the backend modules in `packages/backend/src/index.ts`:
   ```ts
   backend.add(import('@internal/plugin-catalog-backend-module-engagement'));
   backend.add(import('@internal/plugin-scaffolder-backend-module-engagement'));
   backend.add(import('@backstage/plugin-notifications-backend'));
   ```
3. Merge `app-config.engagement.yaml` into your config; set `JIRA_API_TOKEN`
   (and optionally `SLACK_ENGAGEMENT_WEBHOOK`).
4. In Jira, ensure the UNPL project has the statuses listed in
   `docs/docs/process.md` and an `Engagement Request` issue type.
5. Create the `engagement-registry` GitHub repo (the scaffolder PRs into it)
   and point a catalog `url` location at `engagements/*/catalog-info.yaml`.
6. Replace every placeholder — the complete list with locations lives in
   [`PLACEHOLDERS.md`](./PLACEHOLDERS.md).
7. Add the `EntityEngagementCard` to your `EntityPage.tsx` for kind
   `Engagement` (snippet in `plugins/engagement/src/plugin.ts`).

## Verifying

```sh
npm install
npm run verify   # typecheck + unit tests for all four plugins
```

## Rollout plan

- **Week 1–2:** Intake template live in parallel with direct Jira entry.
  Measure: % of triage agenda items arriving via template, % rejected at
  internal review (baseline vs template-sourced).
- **Week 3:** Direct creation of `Engagement Request` issues restricted in
  Jira to the Backstage service account. The template is now the only door.
- **Week 4:** Retire the Confluence page; redirect it to the TechDocs site.

## Resolved gaps (formerly "known gaps")

- ~~`applyStage` stubbed~~ → `GithubRegistryStageWriter` opens bot PRs against
  the registry repo (`engagement-sync/<name>/<stage>` branches). Idempotent via
  open-PR check; degrades to a logged no-op when `engagement.registry` is
  unconfigured (local dev).
- ~~In-memory stage store~~ → `DatabaseStageStore` on `coreServices.database`;
  restarts no longer re-fire notifications.
- ~~Manual IA sub-tickets~~ → on transition to `ia-in-progress`, the sync cuts
  one Jira ticket per team in `spec.impactAssessments` lacking a `jiraKey`.
  Idempotent via deterministic label search; new keys land in the same
  registry PR as the stage change.
- ~~No frontend card~~ → `plugins/engagement` ships `EntityEngagementCard`:
  stage stepper, IA progress table, environment chips.

## Remaining nice-to-haves

- The 5-minute poll could become a Jira webhook for sub-minute latency; keep
  the poll as the reconciliation fallback either way.
- Auto-merge for `engagement-sync/*` PRs (branch protection + bot approval)
  if PR review of mirror commits proves to be pure friction.
