import { Module } from '@nestjs/common';
import { StoresModule } from '../stores/stores.module';
import { DriverDeviceGuard } from './driver-device.guard';
import { DriverPhoneController, DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

/** Drivers and phone pairing (#81). Reuse: `@Public() @UseGuards(DriverDeviceGuard)` and `req.driver` for `/api/driver/*`. */
@Module({
  imports: [StoresModule],
  controllers: [DriversController, DriverPhoneController],
  providers: [DriversService, DriverDeviceGuard],
  exports: [DriversService, DriverDeviceGuard],
})
export class DriversModule {}
