import { GithubRegistryStageWriter } from './RegistryStageWriter';

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(),
} as any;

const ENTITY_YAML = `apiVersion: ce.your-org.io/v1alpha1
kind: Engagement
metadata:
  name: acme-payments-q3
spec:
  stage: triage
  client: ACME Retail
  owner: group:default/ce-tpo
  impactAssessments:
    - team: group:default/payments-team
      status: pending
    - team: group:default/platform-team
      status: in-progress
      jiraKey: UNPL-1044
`;

/** fetch mock routing GitHub REST calls to canned responses. */
function makeFetch(opts: { openPrs?: any[] } = {}) {
  const calls: Array<{ method: string; url: string; body?: any }> = [];
  const fetchFn = jest.fn(async (url: any, init: any = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, url: String(url), body });

    const respond = (json: any) =>
      ({ ok: true, json: async () => json, text: async () => '' } as any);

    if (url.includes('/pulls?')) return respond(opts.openPrs ?? []);
    if (url.includes('/contents/') && method === 'GET') {
      return respond({
        sha: 'abc123',
        content: Buffer.from(ENTITY_YAML).toString('base64'),
      });
    }
    if (url.includes('/git/ref/heads/')) {
      return respond({ object: { sha: 'basesha' } });
    }
    if (url.includes('/git/refs') && method === 'POST') return respond({});
    if (url.includes('/contents/') && method === 'PUT') return respond({});
    if (url.endsWith('/pulls') && method === 'POST') {
      return respond({ html_url: 'https://github.com/your-org/engagement-registry/pull/7' });
    }
    throw new Error(`unhandled ${method} ${url}`);
  });
  return { fetchFn, calls };
}

const config = {
  owner: 'your-org',
  repo: 'engagement-registry',
  token: 't0ken',
};

describe('GithubRegistryStageWriter', () => {
  it('opens a PR mutating spec.stage and preserves the rest of the YAML', async () => {
    const { fetchFn, calls } = makeFetch();
    const writer = new GithubRegistryStageWriter(config, logger, fetchFn as any);

    const result = await writer.applyStage({
      entityName: 'acme-payments-q3',
      stage: 'ia-in-progress',
      impactAssessmentKeys: { 'group:default/payments-team': 'UNPL-99' },
    });

    expect(result.prUrl).toContain('/pull/7');

    const put = calls.find(c => c.method === 'PUT')!;
    const written = Buffer.from(put.body.content, 'base64').toString('utf8');
    expect(written).toContain('stage: ia-in-progress');
    expect(written).toContain('jiraKey: UNPL-99'); // payments-team got its key
    expect(written).toContain('jiraKey: UNPL-1044'); // platform-team untouched
    expect(written).toContain('client: ACME Retail'); // rest preserved

    const pr = calls.find(c => c.method === 'POST' && c.url.endsWith('/pulls'))!;
    expect(pr.body.head).toBe('engagement-sync/acme-payments-q3/ia-in-progress');
    expect(pr.body.base).toBe('main');
  });

  it('is idempotent: an open PR for the same transition short-circuits', async () => {
    const { fetchFn, calls } = makeFetch({
      openPrs: [{ html_url: 'https://github.com/your-org/engagement-registry/pull/5' }],
    });
    const writer = new GithubRegistryStageWriter(config, logger, fetchFn as any);

    const result = await writer.applyStage({
      entityName: 'acme-payments-q3',
      stage: 'allocated',
    });

    expect(result.prUrl).toContain('/pull/5');
    expect(calls.filter(c => c.method !== 'GET')).toHaveLength(0); // no writes
  });

  it('writes nothing when the file already has the target stage', async () => {
    const { fetchFn, calls } = makeFetch();
    const writer = new GithubRegistryStageWriter(config, logger, fetchFn as any);

    const result = await writer.applyStage({
      entityName: 'acme-payments-q3',
      stage: 'triage', // already the value in ENTITY_YAML
    });

    expect(result.prUrl).toBeUndefined();
    expect(calls.filter(c => c.method !== 'GET')).toHaveLength(0);
  });
});
