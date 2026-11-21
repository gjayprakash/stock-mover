import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { DriverDeviceGuard } from '../drivers/driver-device.guard';
import { storeOf } from '../drivers/drivers.controller';
import { ShipmentsService } from './shipments.service';

/** Store manager (scoped to their store) or super admin (the Viewing store). */
@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Get()
  list(@Req() req: Request, @Query('dir') dir?: string) {
    if (dir !== 'in' && dir !== 'out') throw new BadRequestException({ error: "dir must be 'in' or 'out'" });
    return this.shipments.list(storeOf(req), dir);
  }

  @Post(':id/assign')
  @HttpCode(200)
  assign(@Req() req: Request, @Param('id') id: string, @Body() body: { driver_id?: unknown }) {
    return this.shipments.assign(storeOf(req), id, body?.driver_id, req.user?.id);
  }

  @Post(':id/receive')
  @HttpCode(200)
  receive(@Req() req: Request, @Param('id') id: string, @Body() body: { qty_received?: unknown }) {
    return this.shipments.receive(storeOf(req), id, body?.qty_received, req.user?.id);
  }
}

/** The driver's phone (device cookie). Never 404 here: the phone treats 404 as "API not deployed". */
@Public()
@UseGuards(DriverDeviceGuard)
@Controller('driver')
export class DriverTripController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Get('trip')
  trip(@Req() req: Request) {
    return this.shipments.trips(req.driver!.driver_id);
  }

  @Post('picked-up')
  @HttpCode(204)
  async pickedUp(@Req() req: Request) {
    await this.shipments.pickedUp(req.driver!.driver_id);
  }

  @Post('ping')
  @HttpCode(204)
  async ping(@Req() req: Request, @Body() body: Record<string, unknown>) {
    await this.shipments.ping(req.driver!.driver_id, req.driver!.device_id, body ?? {});
  }

  /** `photo` is accepted and not stored (phase 1). */
  @Post('delivered')
  @HttpCode(204)
  async delivered(@Req() req: Request) {
    await this.shipments.delivered(req.driver!.driver_id);
  }
}
