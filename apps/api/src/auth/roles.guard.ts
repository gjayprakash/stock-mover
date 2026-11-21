import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES } from './roles.decorator';

/** Global guard (APP_GUARD, after AuthGuard). Routes with `@Roles(...)` need a signed-in user with that role. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride(ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (!roles?.length || ctx.getType() !== 'http') return true;
    const user = ctx.switchToHttp().getRequest<Request>().user;
    if (!user) throw new UnauthorizedException({ error: 'Sign in first' });
    if (!roles.includes(user.role)) throw new ForbiddenException({ error: 'Your role cannot do this' });
    return true;
  }
}
