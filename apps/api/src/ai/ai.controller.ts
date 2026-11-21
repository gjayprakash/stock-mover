import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { AiLogService } from './ai-log.service';
import { BriefService } from './brief.service';

@Controller()
export class AiController {
  constructor(
    private readonly brief: BriefService,
    private readonly aiLog: AiLogService,
  ) {}

  @Get('brief')
  async getBrief() {
    const b = await this.brief.latest();
    if (!b) throw new NotFoundException({ error: 'no run yet' });
    return b;
  }

  @Get('ai/log')
  log(@Query('run') run?: string) {
    return this.aiLog.list(run || undefined);
  }
}
