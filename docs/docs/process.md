# Process Flow

\`\`\`mermaid
flowchart TD
    A[Requester opens intake template] --> B{Nature of request?}
    B -- "Defect" --> Z1[Redirected to Defect Management<br/>no ticket created]
    B -- "Change to in-flight work" --> C[Linked to parent Engagement]
    B -- "New engagement" --> D
    C --> D[Jira ticket created on Unplanned board<br/>Engagement entity registered<br/>CE TPOs notified]

    D --> E[Internal Review — CE TPO]
    E -- "Incomplete" --> E1[Return to requester<br/>for information] --> E
    E -- "Already interlocked /<br/>duplicate" --> Z2[Close — link to<br/>existing engagement]
    E -- "Complete" --> F[Weekly Triage Board]

    F -- "More info needed" --> E1
    F -- "Close & re-present" --> Z3[Closed — requester may<br/>re-present next cycle]
    F -- "Accept" --> G[Impact Assessments cut<br/>to flagged teams]

    G --> H{All IAs complete?}
    H -- "No" --> G
    H -- "Yes" --> I[Environment allocation<br/>BLD / INT / PRE]
    I --> I1[SRE/Run + NFT informed]
    I1 --> J[Interlock]
    J --> K[Handoff to Release Management]

    style Z1 fill:#fdd,stroke:#c33
    style Z2 fill:#fdd,stroke:#c33
    style Z3 fill:#fdd,stroke:#c33
    style K fill:#dfd,stroke:#3a3
\`\`\`

## Stage / Jira status mapping

| spec.stage | Jira status | Owner of next action |
|---|---|---|
| submitted | Submitted | CE TPO |
| internal-review | Internal Review | CE TPO |
| triage | Triage | Triage Board |
| ia-in-progress | IA In Progress | Impacted teams |
| allocated | Environment Allocated | CE TPO |
| interlocked | Interlocked | Release Management |
| closed | Closed / Done | — |

The mapping is enforced by `JIRA_STATUS_TO_STAGE` in
`EngagementJiraStatusSync.ts`; renaming a Jira status without updating that
table makes the sync log warnings and stop mirroring.

## What happens automatically at `IA In Progress`

When the ticket enters *IA In Progress*, the sync cuts one Jira ticket per
team listed in `spec.impactAssessments` that doesn't already have a `jiraKey`.
Creation is idempotent (deterministic label per engagement+team), and the new
keys are written back to the entity in the same registry pull request as the
stage change. Teams are notified through Backstage notifications at the same
moment — no manual fan-out.
