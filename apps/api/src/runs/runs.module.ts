import { Module } from '@nestjs/common';
import { GeoModule } from '../geo/geo.module';
import { MovesController } from './moves.controller';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';

@Module({
  imports: [GeoModule],
  controllers: [RunsController, MovesController],
  providers: [RunsService],
  exports: [RunsService],
})
export class RunsModule {}
