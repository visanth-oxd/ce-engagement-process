# Inbound Engagement Process

## Problem statement

Inbound requests for new work arrive through inconsistent channels, with
incomplete information, and frequently misrouted (defects raised as
engagements, changes to in-flight work raised as new requests). Triage spends
its weekly slot rejecting malformed tickets instead of making decisions, and
downstream parties (impacted teams, SRE/Run, NFT, Release Management) learn
about work affecting them too late or not at all.

## Principles

1. **One front door.** All new engagements enter via the Backstage intake
   template — never directly onto the Unplanned board.
2. **Defects are not engagements.** Bugs related to ongoing or delivered work
   go through Defect Management. The intake form gates this before submission.
3. **Jira is the state machine.** Workflow stage lives in Jira statuses.
   Backstage mirrors it (read-only) and provides the pane of glass.
4. **Triage decides; it does not gather.** Internal review (CE TPO) ensures
   requests arrive at triage complete. Triage outcomes are: accept, request
   more info, or close and re-present.
5. **Nobody is surprised.** RACI Informed/Consulted parties are notified
   automatically on stage transitions — never as a manual step.
6. **Environments are visible contention.** Allocation is a catalog relation,
   so "who holds INT?" is a query, not a question in a channel.

## Where things live

| Concern | System |
|---|---|
| Intake form | Backstage Scaffolder (inbound-engagement-request) |
| Workflow state | Jira (Unplanned board, UNPL) |
| Engagement registry | Engagement entities in the catalog (GitOps repo) |
| Environment allocation | dependsOn relations to BLD/INT/PRE Resources |
| Notifications | Backstage notifications + Slack mirror |
| This documentation | TechDocs (you are here) — versioned with the template |
