/**
 * Minimal Jira REST v3 client — only the calls the sync needs.
 * Injectable interface so the sync is unit-testable without Jira.
 */

export interface CreateIssueRequest {
  projectKey: string;
  issueType: string;
  summary: string;
  description: string;
  labels?: string[];
}

export interface JiraClient {
  getIssueStatus(issueKey: string): Promise<string>;
  /** Returns the created issue key. */
  createIssue(req: CreateIssueRequest): Promise<string>;
  /** JQL search by label — used for idempotent IA sub-ticket creation. */
  findIssueKeysByLabel(label: string): Promise<string[]>;
}

export function createJiraClient(opts: {
  baseUrl: string;
  token: string;
  fetchFn?: typeof fetch;
}): JiraClient {
  const fetchFn = opts.fetchFn ?? fetch;
  const headers = {
    Authorization: `Bearer ${opts.token}`,
    Accept: 'application/json',
  };

  return {
    async getIssueStatus(issueKey: string): Promise<string> {
      const res = await fetchFn(
        `${opts.baseUrl}/rest/api/3/issue/${issueKey}?fields=status`,
        { headers },
      );
      if (!res.ok) throw new Error(`Jira ${res.status} for ${issueKey}`);
      const body = await res.json();
      return body.fields.status.name as string;
    },

    async createIssue(req: CreateIssueRequest): Promise<string> {
      const res = await fetchFn(`${opts.baseUrl}/rest/api/3/issue`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            project: { key: req.projectKey },
            issuetype: { name: req.issueType },
            summary: req.summary,
            labels: req.labels ?? [],
            description: {
              type: 'doc',
              version: 1,
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: req.description }],
                },
              ],
            },
          },
        }),
      });
      if (!res.ok) {
        throw new Error(`Jira issue creation failed: ${res.status} ${await res.text()}`);
      }
      const body = await res.json();
      return body.key as string;
    },

    async findIssueKeysByLabel(label: string): Promise<string[]> {
      const jql = encodeURIComponent(`labels = "${label}"`);
      const res = await fetchFn(
        `${opts.baseUrl}/rest/api/3/search?jql=${jql}&fields=key&maxResults=10`,
        { headers },
      );
      if (!res.ok) throw new Error(`Jira search failed: ${res.status}`);
      const body = await res.json();
      return (body.issues ?? []).map((i: any) => i.key as string);
    },
  };
}
