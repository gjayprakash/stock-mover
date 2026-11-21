import { Controller, Get, Headers, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Public } from '../auth/public.decorator';
import { RunsService } from './runs.service';

function secretOk(given: string | undefined) {
  const expected = process.env.CRON_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Controller()
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  // Daily trigger (GitHub Actions schedule). Runs in the background.
  @Public()
  @Post('run')
  @HttpCode(202)
  async run(@Headers('x-cron-secret') secret?: string) {
    if (!secretOk(secret)) throw new UnauthorizedException({ error: 'bad or missing X-Cron-Secret' });
    return { run_id: await this.runs.start('cron') };
  }

  @Get('runs')
  list() {
    return this.runs.list();
  }
}
