import { Controller, Get } from '@nestjs/common';
import { DbService } from './db/db.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DbService) {}

  @Get()
  async health() {
    if (!this.db.configured) return { ok: true, db: 'not configured' };
    try {
      const [row] = await this.db.query<{ now: string; version: string }>(
        'select now() as now, version() as version',
      );
      return { ok: true, db: 'connected', now: row.now, version: row.version };
    } catch (e) {
      return { ok: false, db: 'error', error: (e as Error).message };
    }
  }
}
