import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';

@Injectable()
export class DbService implements OnModuleDestroy {
  // Neon connection string carries sslmode=require.
  private readonly pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
    : null;

  get configured() {
    return this.pool !== null;
  }

  async query<T extends QueryResultRow>(sql: string, params: unknown[] = []) {
    if (!this.pool) throw new Error('DATABASE_URL is not set');
    return (await this.pool.query<T>(sql, params)).rows;
  }

  // Tiny schema bootstrap: CREATE ... IF NOT EXISTS, run once on boot.
  async migrate() {
    if (!this.pool) return;
    await this.query(`
      create table if not exists runs (
        run_id text primary key,
        as_of date not null,
        started_at timestamptz not null,
        finished_at timestamptz,
        status text not null,
        trigger text not null,
        moves_json jsonb,
        history_json jsonb,
        move_count int not null default 0,
        violations int not null default 0,
        error text
      )`);
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }
}
