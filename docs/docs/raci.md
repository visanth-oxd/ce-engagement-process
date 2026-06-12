# RACI

| Stage | Requester | CE TPO | Triage Board | Impacted Teams | SRE/Run | NFT | Release Mgmt |
|---|---|---|---|---|---|---|---|
| Intake / submission | **R** | A | I | – | – | – | – |
| Internal review | C | **A/R** | I | – | – | – | – |
| Weekly triage | C | R | **A** | C | I | I | I |
| Impact assessment | C | A | I | **R** | C | C* | – |
| Environment allocation | I | A | I | C | **R** | I | – |
| Interlock & handoff | I | **A/R** | I | I | I | I | **R** (receives) |

\* NFT consulted on IAs where nftRequired: true.

**Automation note:** every **I** in this table is an automatic notification
fired on the corresponding Jira stage transition (see
EngagementJiraStatusSync). If you are adding a new Informed party, add them
to STAGE_NOTIFICATIONS — do not add a manual step to this document.
