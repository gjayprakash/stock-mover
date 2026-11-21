import { Module } from '@nestjs/common';
import { RunsModule } from '../runs/runs.module';
import { AiController } from './ai.controller';
import { AiLogService } from './ai-log.service';
import { BriefService } from './brief.service';
import { ChatController } from './chat.controller';
import { MeshClient } from './mesh.client';

@Module({
  imports: [RunsModule],
  controllers: [AiController, ChatController],
  providers: [MeshClient, AiLogService, BriefService],
})
export class AiModule {}
