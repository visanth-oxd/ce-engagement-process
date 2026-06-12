import { DatabaseService } from '@backstage/backend-plugin-api';
import { EngagementStage } from '@internal/plugin-engagement-common';
import { Knex } from 'knex';

/**
 * Persists the last-seen stage per engagement so transitions are detected
 * exactly once. Backed by the plugin database — an in-memory map would
 * re-fire every RACI notification on backend restart.
 */
export interface StageStore {
  get(entityRef: string): Promise<EngagementStage | undefined>;
  set(entityRef: string, stage: EngagementStage): Promise<void>;
}

/** Test/dev double. Production uses DatabaseStageStore. */
export class InMemoryStageStore implements StageStore {
  private readonly map = new Map<string, EngagementStage>();
  async get(ref: string) {
    return this.map.get(ref);
  }
  async set(ref: string, stage: EngagementStage) {
    this.map.set(ref, stage);
  }
}

const TABLE = 'engagement_stage_sync';

export class DatabaseStageStore implements StageStore {
  private constructor(private readonly db: Knex) {}

  static async create(database: DatabaseService): Promise<DatabaseStageStore> {
    const db = await database.getClient();
    if (!(await db.schema.hasTable(TABLE))) {
      await db.schema.createTable(TABLE, table => {
        table.string('entity_ref').primary().notNullable();
        table.string('stage').notNullable();
        table.timestamp('updated_at', { useTz: false }).defaultTo(db.fn.now());
      });
    }
    return new DatabaseStageStore(db);
  }

  /** Test seam: wrap an existing knex instance (e.g. sqlite in-memory). */
  static async forClient(db: Knex): Promise<DatabaseStageStore> {
    if (!(await db.schema.hasTable(TABLE))) {
      await db.schema.createTable(TABLE, table => {
        table.string('entity_ref').primary().notNullable();
        table.string('stage').notNullable();
        table.timestamp('updated_at', { useTz: false }).defaultTo(db.fn.now());
      });
    }
    return new DatabaseStageStore(db);
  }

  async get(entityRef: string): Promise<EngagementStage | undefined> {
    const row = await this.db(TABLE).where({ entity_ref: entityRef }).first();
    return row?.stage as EngagementStage | undefined;
  }

  async set(entityRef: string, stage: EngagementStage): Promise<void> {
    await this.db(TABLE)
      .insert({ entity_ref: entityRef, stage, updated_at: this.db.fn.now() })
      .onConflict('entity_ref')
      .merge(['stage', 'updated_at']);
  }
}
