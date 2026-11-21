import { Module } from '@nestjs/common';
import { GeoModule } from '../geo/geo.module';
import { StoresController } from './stores.controller';
import { StoresService } from './stores.service';

@Module({
  imports: [GeoModule],
  controllers: [StoresController],
  providers: [StoresService],
  exports: [StoresService],
})
export class StoresModule {}
