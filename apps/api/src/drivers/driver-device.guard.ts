import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { readCookie } from '../auth/http';
import { hashToken } from '../auth/sessions.service';
import { DbService } from '../db/db.service';

/** Device cookie set by POST /api/driver/pair. HttpOnly, Secure, SameSite=Lax; renewed on every call. */
export const DRIVER_COOKIE = '__Host-drv';
const DEVICE_MS = 180 * 24 * 60 * 60 * 1000;

export type DriverDevice = { driver_id: string; device_id: string; location_id: string };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by DriverDeviceGuard: the paired phone and its driver. */
      driver?: DriverDevice;
    }
  }
}

export function setDriverCookie(res: Response, token: string) {
  res.cookie(DRIVER_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: DEVICE_MS });
}

/**
 * For `/api/driver/*` (use with `@Public()` so the user-session guard lets the phone through):
 * a paired, not revoked device of an active driver, else 401. Sets `req.driver`.
 */
@Injectable()
export class DriverDeviceGuard implements CanActivate {
  constructor(private readonly db: DbService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const token = readCookie(req, DRIVER_COOKIE);
    if (!token || token.length > 100 || !this.db.configured) throw new UnauthorizedException({ error: 'This phone is not paired' });
    const [row] = await this.db.query<DriverDevice & { stale: boolean }>(
      `select v.driver_id, v.id as device_id, d.location_id, v.last_seen_at < now() - interval '5 minutes' as stale
         from driver_devices v join drivers d on d.id = v.driver_id
        where v.token_hash = $1 and v.revoked_at is null and d.active`,
      [hashToken(token)],
    );
    if (!row) throw new UnauthorizedException({ error: 'This phone is not paired' });
    if (row.stale) await this.db.query(`update driver_devices set last_seen_at = now() where id = $1`, [row.device_id]);
    setDriverCookie(ctx.switchToHttp().getResponse<Response>(), token);
    req.driver = { driver_id: row.driver_id, device_id: row.device_id, location_id: row.location_id };
    return true;
  }
}
