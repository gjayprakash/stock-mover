import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { Scope } from '@sm/contract';
import type { Request } from 'express';

/**
 * The data one request may see, from `req.user` (AuthGuard):
 * store_manager → always their own location_id (any `?location=` is ignored);
 * super_admin, or nobody while AUTH_REQUIRED is off → `?location=` (the Viewing picker) if given, else all.
 */
export function scopeOf(req: Request): Scope {
  const user = req.user;
  if (user?.role === 'store_manager') {
    if (!user.location_id) throw new ForbiddenException({ error: 'No store is assigned to you yet' });
    return { locationId: user.location_id };
  }
  const q = req.query.location;
  const loc = typeof q === 'string' ? q.trim().toUpperCase() : '';
  return loc ? { locationId: loc } : { all: true };
}

/** Controller parameter: `@ReqScope() scope: Scope`. */
export const ReqScope = createParamDecorator((_: unknown, ctx: ExecutionContext): Scope => scopeOf(ctx.switchToHttp().getRequest<Request>()));
