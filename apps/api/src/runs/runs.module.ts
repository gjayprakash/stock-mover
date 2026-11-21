import { Module } from '@nestjs/common';
import { MovesController } from './moves.controller';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';

@Module({
  controllers: [RunsController, MovesController],
  providers: [RunsService],
  exports: [RunsService],
})
export class RunsModule {}
