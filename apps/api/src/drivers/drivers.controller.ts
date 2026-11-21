import { Body, Controller, ForbiddenException, Get, HttpCode, HttpException, Param, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { clientIp, isHttps } from '../auth/http';
import { Public } from '../auth/public.decorator';
import { scopeOf } from '../auth/scope';
import { DriverDeviceGuard, setDriverCookie } from './driver-device.guard';
import { DriversService } from './drivers.service';

/** The manager's store (#77 scope: own store, or the super admin's Viewing pick). */
export function storeOf(req: Request): string {
  const scope = scopeOf(req);
  if ('locationId' in scope) return scope.locationId;
  throw new ForbiddenException({ error: 'Pick a store to manage its drivers' });
}

/** https://<host> the manager is on, for the pair link. */
function originOf(req: Request): string {
  const origin = req.headers.origin;
  if (origin && /^https?:\/\/[^/]+$/.test(origin)) return origin;
  const fwd = req.headers['x-forwarded-host'];
  return `${isHttps(req) ? 'https' : 'http'}://${(Array.isArray(fwd) ? fwd[0] : fwd) ?? req.headers.host}`;
}

@Controller('drivers')
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Get()
  list(@Req() req: Request) {
    return this.drivers.list(storeOf(req));
  }

  @Get(':id')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.drivers.get(storeOf(req), id);
  }

  @Post()
  create(@Req() req: Request, @Body() body: { name?: unknown; mobile?: unknown }) {
    return this.drivers.create(storeOf(req), body ?? {}, originOf(req), req.user?.id);
  }

  @Post(':id/pair-link')
  pairLink(@Req() req: Request, @Param('id') id: string) {
    return this.drivers.pairLink(storeOf(req), id, originOf(req), req.user?.id);
  }

  @Post(':id/revoke')
  revoke(@Req() req: Request, @Param('id') id: string) {
    return this.drivers.revoke(storeOf(req), id);
  }
}

const PAIR_WINDOW_MS = 60 * 1000;
const PAIR_MAX = 10; // tries per IP per minute
const pairTries = new Map<string, number[]>();

function pairLimited(ip: string): boolean {
  const now = Date.now();
  for (const [k, ts] of pairTries) if (now - ts[ts.length - 1] >= PAIR_WINDOW_MS) pairTries.delete(k);
  const recent = (pairTries.get(ip) ?? []).filter((t) => now - t < PAIR_WINDOW_MS);
  pairTries.set(ip, [...recent, now]);
  return recent.length >= PAIR_MAX;
}

/** The driver's phone. No user session: `/pair` is open, the rest needs the device cookie. */
@Public()
@Controller('driver')
export class DriverPhoneController {
  constructor(private readonly drivers: DriversService) {}

  @Post('pair')
  @HttpCode(204)
  async pair(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: { token?: unknown }) {
    if (pairLimited(clientIp(req))) throw new HttpException({ error: 'Too many tries. Wait a minute.' }, 429);
    const device = await this.drivers.pair(typeof body?.token === 'string' ? body.token : '', req.headers['user-agent']);
    // 410, not 404: the phone app treats 404 as "API not deployed yet".
    if (!device) throw new HttpException({ error: 'This link is used or expired. Ask your manager for a new one.' }, 410);
    setDriverCookie(res, device);
  }

  /** Join screen: store and manager behind a link, without using it (POST so the token never sits in a URL). */
  @Post('pair-preview')
  @HttpCode(200)
  async pairPreview(@Req() req: Request, @Body() body: { token?: unknown }) {
    if (pairLimited(clientIp(req))) throw new HttpException({ error: 'Too many tries. Wait a minute.' }, 429);
    const who = await this.drivers.preview(typeof body?.token === 'string' ? body.token : '');
    if (!who) throw new HttpException({ error: 'This link is used or expired. Ask your manager for a new one.' }, 410);
    return who;
  }

  @UseGuards(DriverDeviceGuard)
  @Get('me')
  me(@Req() req: Request) {
    return this.drivers.me(req.driver!.driver_id);
  }

  @UseGuards(DriverDeviceGuard)
  @Patch('me')
  @HttpCode(204)
  async setLang(@Req() req: Request, @Body() body: { lang?: unknown }) {
    await this.drivers.setLang(req.driver!.driver_id, body?.lang);
  }
}
