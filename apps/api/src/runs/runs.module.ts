import { Module } from '@nestjs/common';
import { GeoModule } from '../geo/geo.module';
import { StoresModule } from '../stores/stores.module';
import { StockModule } from '../stock/stock.module';
import { ShipmentsModule } from '../shipments/shipments.module';
import { MovesController } from './moves.controller';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';

@Module({
  imports: [GeoModule, StoresModule, StockModule, ShipmentsModule],
  controllers: [RunsController, MovesController],
  providers: [RunsService],
  exports: [RunsService],
})
export class RunsModule {}
