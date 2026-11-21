import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Me } from '@sm/contract';
import type { Request } from 'express';
import { COOKIE, readCookie } from './http';
import { IS_PUBLIC } from './public.decorator';
import { SessionsService } from './sessions.service';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by AuthGuard when the `__Host-sid` cookie belongs to a live session of an active user. */
      user?: Me;
    }
  }
}

/**
 * Global guard (APP_GUARD). Always loads `req.user` from the session cookie.
 * Every route without `@Public()` answers 401 to a caller without a session (sign-in is always on).
 * Static files and the SPA fallback never reach Nest guards.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const token = readCookie(req, COOKIE);
    req.user = token ? ((await this.sessions.user(token)) ?? undefined) : undefined;
    if (req.user) return true;
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    throw new UnauthorizedException({ error: 'Sign in first' });
  }
}
