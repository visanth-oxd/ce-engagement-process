# Triage Operating Guide

Weekly, 45 minutes, chaired by the Triage Board. Inputs are pre-filtered by
CE TPO internal review — if a request is incomplete, it should not be on the
agenda.

## Agenda source

The agenda is the catalog query: all Engagement entities with
spec.stage = triage, ordered by requestedDate. No separate list.

## Permitted outcomes (and only these)

1. **Accept** — IAs are cut to the teams on the entity within 1 working day.
2. **Request more info** — ticket returns to Internal Review with named
   questions; requester is notified automatically.
3. **Close & re-present** — request is closed with rationale on the Jira
   ticket. Requester may re-submit via the intake template next cycle.

Decisions that try to happen in triage but belong elsewhere:

- *"Is this a defect?"* — should have been caught at intake/review. If it
  reaches triage, close it and fix the gate, not the meeting.
- *"Which environment?"* — allocation happens after IAs complete, by SRE/Run.
- *"When does it ship?"* — Release Management, after interlock.

## Contention view

Before allocating, check the environment Resource pages
(BLD / INT / PRE) — the *Dependents* relation lists every engagement
currently holding the environment.
