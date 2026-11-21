import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { sessionCookie } from './http';

/**
 * Global guard on every Nest route (all of them live under /api).
 * Open: /api/auth/*, /api/me (answers 401 itself), GET /api/health (Render health check),
 * POST /api/run (has its own X-Cron-Secret). Static files and the SPA fallback never reach Nest guards.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (!this.auth.enabled || ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const path = req.path.toLowerCase().replace(/\/+$/, '');
    if (path.startsWith('/api/auth/') || path === '/api/me') return true;
    if (req.method === 'GET' && path === '/api/health') return true;
    if (req.method === 'POST' && path === '/api/run') return true;
    if (this.auth.verify(sessionCookie(req))) return true;
    throw new UnauthorizedException({ error: 'Sign in first' });
  }
}
