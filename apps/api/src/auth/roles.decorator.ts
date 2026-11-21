import { Reflector } from '@nestjs/core';
import type { Role } from '@sm/contract';

export const ROLES = Reflector.createDecorator<Role[]>();
/** `@Roles('super_admin')`: signed-in user with one of these roles, always enforced (AUTH_REQUIRED or not). */
export const Roles = (...roles: Role[]) => ROLES(roles);
