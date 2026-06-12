# Engagement Registry

Source of truth for `Engagement` entities. One directory per engagement under
`engagements/`, each containing the entity (`catalog-info.yaml`) and its
TechDocs. Git is the database: every state change is a reviewed commit.

This repo holds **data, not code**. The process implementation (plugins,
intake template, docs) lives in
[`ce-engagement-process`](https://github.com/visanth-oxd/ce-engagement-process).

## Who writes here

| Writer | What | How |
|---|---|---|
| Scaffolder (intake template) | New `engagements/<name>/` directory | PR per submission — merging is the internal-review gate |
| `EngagementJiraStatusSync` bot | `spec.stage` + IA `jiraKey` mutations | PR on `engagement-sync/<name>/<stage>` branches |
| Humans | Engagement docs (`docs/index.md`), corrections | Normal PRs |

Never hand-edit `spec.stage` — Jira is the workflow's system of record and the
sync will fight you.

## How Backstage reads it

Add to `app-config.yaml` (replaces the local-file example locations):

```yaml
catalog:
  locations:
    - type: url
      target: https://github.com/visanth-oxd/engagement-registry/blob/main/engagements/*/catalog-info.yaml
      rules:
        - allow: [Engagement]
```

## Recommended repo settings

- Branch protection on `main`: require one review (CE TPO / triage board owns
  intake PRs via CODEOWNERS).
- Optional later: auto-merge for `engagement-sync/*` bot PRs once mirror-PR
  review proves to be pure friction.
- The sync bot's token needs `contents:write` + `pull_requests:write` here
  (`GITHUB_REGISTRY_TOKEN` in the Backstage deployment).

## Layout

```
engagements/
  <engagement-name>/
    catalog-info.yaml   # the Engagement entity
    mkdocs.yml          # TechDocs build config
    docs/index.md       # engagement-specific notes, scoping, decisions
```

`engagements/acme-payments-q3/` is a worked example — delete it once real
engagements exist.
