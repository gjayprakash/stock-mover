import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import type { HistoryFile } from '@sm/contract';
import { RunsService } from './runs.service';

const MAX_HISTORY_KEYS = 200;

@Controller()
export class MovesController {
  constructor(private readonly runs: RunsService) {}

  @Get('moves')
  async moves() {
    const run = await this.runs.latest();
    if (!run) throw new NotFoundException({ error: 'no run yet' });
    return run.moves;
  }

  // ?keys=LKO-01|KUR-12-XL,PAT-02|KUR-02-M
  @Get('history')
  async history(@Query('keys') keys = '') {
    const run = await this.runs.latest();
    if (!run) throw new NotFoundException({ error: 'no run yet' });
    const out: HistoryFile = {};
    for (const key of keys.split(',').filter(Boolean).slice(0, MAX_HISTORY_KEYS)) {
      if (run.history[key]) out[key] = run.history[key];
    }
    return out;
  }
}
