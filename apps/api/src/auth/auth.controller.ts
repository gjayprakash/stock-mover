import { Body, Controller, Get, HttpCode, HttpException, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, COOKIE, SESSION_MS } from './auth.service';
import { clientIp, isHttps, sessionCookie } from './http';

const WRONG = 'Email or password is wrong';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('auth/login')
  @HttpCode(204)
  async login(@Body() body: { email?: unknown; password?: unknown }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!this.auth.enabled) return;
    const ip = clientIp(req);
    if (this.auth.limited(ip)) throw new HttpException({ error: 'Too many tries, wait a minute' }, 429);
    const email = typeof body?.email === 'string' ? body.email : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const who = await this.auth.check(email, password);
    if (!who) {
      this.auth.recordFail(ip);
      throw new UnauthorizedException({ error: WRONG });
    }
    res.cookie(COOKIE, this.auth.sign(who), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: isHttps(req),
      maxAge: SESSION_MS,
    });
  }

  @Post('auth/logout')
  @HttpCode(204)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', path: '/', secure: isHttps(req) });
  }

  @Get('me')
  me(@Req() req: Request) {
    if (!this.auth.enabled) return { enabled: false, email: null };
    const email = this.auth.verify(sessionCookie(req));
    if (!email) throw new UnauthorizedException({ error: 'Sign in first' });
    return { enabled: true, email };
  }
}
