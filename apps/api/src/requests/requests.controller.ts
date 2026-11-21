import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { WAREHOUSE_ID } from '../engine/params';
import { RequestsService, type Actor } from './requests.service';

/** Store manager → own store always. Super admin → the Viewing store (?store= / ?location= / body.to_location), else WH-KOL. */
function actor(req: Request, picked?: unknown): Actor {
  const u = req.user;
  if (u?.role === 'store_manager') {
    if (!u.location_id) throw new ForbiddenException({ error: 'No store is assigned to you yet' });
    return { id: u.id, role: u.role, location: u.location_id };
  }
  const q = [req.query.store, req.query.location, picked].find((x) => typeof x === 'string' && x.trim());
  const location = typeof q === 'string' ? q.trim().toUpperCase() : WAREHOUSE_ID;
  return { id: u?.id ?? null, role: u?.role ?? null, location };
}

@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get('sources')
  sources(@Req() req: Request, @Query('sku') sku: string) {
    return this.requests.sources(actor(req).location, sku);
  }

  @Get()
  list(@Req() req: Request, @Query('box') box: string) {
    return this.requests.list(actor(req), box);
  }

  @Post()
  create(@Req() req: Request, @Body() body: { sku_id?: unknown; qty?: unknown; from_location?: unknown; to_location?: unknown }) {
    return this.requests.create(actor(req, body?.to_location), body ?? {});
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(@Req() req: Request, @Param('id') id: string) {
    return this.requests.approve(actor(req), id);
  }

  @Post(':id/signoff')
  @HttpCode(200)
  signoff(@Req() req: Request, @Param('id') id: string) {
    return this.requests.signoff(actor(req), id);
  }

  @Post(':id/decline')
  @HttpCode(200)
  decline(@Req() req: Request, @Param('id') id: string, @Body() body: { reason?: unknown }) {
    return this.requests.decline(actor(req), id, body?.reason);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Req() req: Request, @Param('id') id: string) {
    return this.requests.cancel(actor(req), id);
  }
}
