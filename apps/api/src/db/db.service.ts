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

  async onModuleDestroy() {
    await this.pool?.end();
  }
}
