import { Module } from '@nestjs/common';
import { GeoModule } from '../geo/geo.module';
import { RunsModule } from '../runs/runs.module';
import { StockModule } from '../stock/stock.module';
import { StoresModule } from '../stores/stores.module';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

/** Requests between stores (#79): sources, create, approve / sign-off / decline / cancel. Approval creates the shipment row (#82). */
@Module({
  imports: [GeoModule, StoresModule, StockModule, RunsModule],
  controllers: [RequestsController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
