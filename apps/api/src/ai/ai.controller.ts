import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import type { Scope } from '@sm/contract';
import { ReqScope } from '../auth/scope';
import { AiLogService } from './ai-log.service';
import { BriefService } from './brief.service';

@Controller()
export class AiController {
  constructor(
    private readonly brief: BriefService,
    private readonly aiLog: AiLogService,
  ) {}

  @Get('brief')
  async getBrief(@ReqScope() scope: Scope) {
    const b = await this.brief.latest(scope);
    if (!b) throw new NotFoundException({ error: 'no run yet' });
    return b;
  }

  @Get('ai/log')
  log(@ReqScope() scope: Scope, @Query('run') run?: string) {
    return this.aiLog.list(scope, run || undefined);
  }
}
