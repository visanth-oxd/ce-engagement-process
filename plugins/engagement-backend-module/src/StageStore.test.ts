import knexFactory, { Knex } from 'knex';
import { DatabaseStageStore, InMemoryStageStore } from './StageStore';

// better-sqlite3 is a native optional dep; environments that can't build it
// (no compiler / blocked prebuilt downloads) skip the DB-backed suite.
// It always runs in a real Backstage workspace and in CI.
let sqliteAvailable = true;
try {
  require('better-sqlite3');
} catch {
  sqliteAvailable = false;
}
const describeDb = sqliteAvailable ? describe : describe.skip;

describeDb('DatabaseStageStore', () => {
  let db: Knex;

  beforeAll(() => {
    db = knexFactory({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('returns undefined for unknown refs, persists and upserts stages', async () => {
    const store = await DatabaseStageStore.forClient(db);

    expect(await store.get('engagement:default/x')).toBeUndefined();

    await store.set('engagement:default/x', 'triage');
    expect(await store.get('engagement:default/x')).toBe('triage');

    // upsert, not duplicate-insert
    await store.set('engagement:default/x', 'ia-in-progress');
    expect(await store.get('engagement:default/x')).toBe('ia-in-progress');

    const rows = await db('engagement_stage_sync').select();
    expect(rows).toHaveLength(1);
  });

  it('survives re-initialisation (schema creation is idempotent)', async () => {
    const again = await DatabaseStageStore.forClient(db);
    expect(await again.get('engagement:default/x')).toBe('ia-in-progress');
  });
});

describe('InMemoryStageStore', () => {
  it('behaves like the database store for get/set', async () => {
    const store = new InMemoryStageStore();
    expect(await store.get('r')).toBeUndefined();
    await store.set('r', 'closed');
    expect(await store.get('r')).toBe('closed');
  });
});
