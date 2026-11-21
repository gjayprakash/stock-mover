import { Module } from '@nestjs/common';
import { DriversModule } from '../drivers/drivers.module';
import { GeoModule } from '../geo/geo.module';
import { StockModule } from '../stock/stock.module';
import { StoresModule } from '../stores/stores.module';
import { DriverTripController, ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';

/** Shipments, driver trips and pings (#82). Exports ShipmentsService.engineTransfers() for the daily run (rule 3). */
@Module({
  imports: [DriversModule, GeoModule, StockModule, StoresModule],
  controllers: [ShipmentsController, DriverTripController],
  providers: [ShipmentsService],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}
