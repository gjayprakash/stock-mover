import { BadRequestException, Body, Controller, Get, NotFoundException, Post, Query } from '@nestjs/common';
import type { NewStoreRequest } from '@sm/contract';
import { GeoService } from '../geo/geo.service';
import { StoresService } from './stores.service';

@Controller()
export class StoresController {
  constructor(
    private readonly stores: StoresService,
    private readonly geo: GeoService,
  ) {}

  // GET /api/geo?pin=823001 → GeoResult + nearest
  @Get('geo')
  lookup(@Query('pin') pin = '') {
    const info = this.geo.lookupPin(pin.trim());
    if (!info) throw new NotFoundException({ error: 'PIN not found; set latitude and longitude by hand' });
    return { ...info, nearest: this.stores.nearest(info) };
  }

  // GET /api/geo/nearest?lat=&lng= (the "set it by hand" path)
  @Get('geo/nearest')
  nearestByHand(@Query('lat') lat?: string, @Query('lng') lng?: string) {
    const p = { lat: Number(lat), lng: Number(lng) };
    if (!lat || !lng || !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) {
      throw new BadRequestException({ errors: [{ field: 'lat', message: 'lat and lng must be numbers' }] });
    }
    return { nearest: this.stores.nearest(p) };
  }

  @Get('stores/next-code')
  nextCode(@Query('city') city = '') {
    return { store_id: this.stores.nextCode(city) };
  }

  @Post('stores')
  create(@Body() body: Partial<Record<keyof NewStoreRequest, unknown>>) {
    return this.stores.create(body ?? {});
  }
}
