import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { csrfCheck } from './csrf.middleware';
import { LoginLimit } from './login-limit';
import { RolesGuard } from './roles.guard';
import { SessionsService } from './sessions.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * Users, sessions, invites. Reuse elsewhere: `@Public()` (public.decorator), `@Roles('super_admin')`
 * (roles.decorator) and `req.user: Me` (set by AuthGuard). Guards run in this order: AuthGuard, RolesGuard.
 */
@Module({
  controllers: [AuthController, UsersController],
  providers: [
    SessionsService,
    UsersService,
    LoginLimit,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [SessionsService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(csrfCheck).forRoutes('{*path}');
  }
}
