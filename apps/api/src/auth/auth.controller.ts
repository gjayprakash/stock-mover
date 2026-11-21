import { BadRequestException, Body, Controller, Get, HttpCode, HttpException, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { authRequired, clearSessionCookie, clientIp, COOKIE, readCookie, setSessionCookie } from './http';
import { LoginLimit } from './login-limit';
import { dummyHash, hashPassword, passwordProblem, PASSWORD_MAX, verifyPassword } from './password';
import { Public } from './public.decorator';
import { SessionsService } from './sessions.service';
import { UsersService } from './users.service';

const WRONG = 'Email or password is wrong';
const MAX_EMAIL = 254;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

@Public()
@Controller()
export class AuthController {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly limit: LoginLimit,
  ) {}

  @Post('auth/login')
  @HttpCode(204)
  async login(@Body() body: { email?: unknown; password?: unknown }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const ip = clientIp(req);
    if (this.limit.limited(ip)) throw new HttpException({ error: 'Too many tries, wait a minute' }, 429);
    const email = str(body?.email);
    const password = str(body?.password);
    // Over-long input is answered as wrong details without spending a scrypt on it.
    const user = email.length > MAX_EMAIL || password.length > PASSWORD_MAX ? null : await this.users.forLogin(email);
    const ok = await verifyPassword(password, user?.password_hash ?? (await dummyHash()));
    if (!user || !ok) {
      this.limit.recordFail(ip);
      throw new UnauthorizedException({ error: WRONG });
    }
    await this.signIn(user.id, req, res);
  }

  @Post('auth/logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = readCookie(req, COOKIE);
    if (token) await this.sessions.end(token);
    clearSessionCookie(res);
  }

  /** Signed in: the user (`enabled: true`). Signed out: 401, or `{ enabled: false }` while AUTH_REQUIRED is off. */
  @Get('me')
  me(@Req() req: Request) {
    if (req.user) return { ...req.user, enabled: true };
    if (authRequired()) throw new UnauthorizedException({ error: 'Sign in first' });
    return { enabled: false, email: null };
  }

  @Post('invites/accept')
  @HttpCode(204)
  async acceptInvite(@Body() body: { token?: unknown; password?: unknown }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = str(body?.token);
    const password = str(body?.password);
    const problem = passwordProblem(password);
    if (problem) throw new BadRequestException({ error: problem });
    const userId = token ? await this.users.acceptInvite(token, await hashPassword(password)) : null;
    if (!userId) throw new BadRequestException({ error: 'This link has expired or was already used. Ask for a new one.' });
    await this.signIn(userId, req, res);
  }

  /** New session id on every sign-in; the old one (if any) is ended. */
  private async signIn(userId: string, req: Request, res: Response) {
    const old = readCookie(req, COOKIE);
    if (old) await this.sessions.end(old);
    setSessionCookie(res, await this.sessions.create(userId, req.headers['user-agent']));
  }
}
