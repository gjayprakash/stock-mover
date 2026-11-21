import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';

export const COOKIE = 'sm_session';
export const SESSION_MS = 12 * 60 * 60 * 1000;
const WINDOW_MS = 60 * 1000;
const MAX_FAILS = 5;
// Compared against when the email is unknown, so timing does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

type User = { email: string; hash: string };

const sha = (s: string) => createHash('sha256').update(s).digest();
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/**
 * Optional sign-in. Off unless APP_USERS ("email:bcryptHash,email:bcryptHash") is set:
 * then every guard check passes and the app behaves as if this module did not exist.
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly log = new Logger('Auth');
  private readonly raw = (process.env.APP_USERS ?? '').trim();
  readonly enabled = this.raw.length > 0;
  private readonly users: User[] = this.raw
    .split(',')
    .map((entry) => {
      const i = entry.indexOf(':');
      return { email: entry.slice(0, i).trim().toLowerCase(), hash: entry.slice(i + 1).trim() };
    })
    .filter((u) => u.email.includes('@') && u.hash.startsWith('$2'));
  private readonly secret = process.env.AUTH_SECRET
    ? Buffer.from(process.env.AUTH_SECRET)
    : sha(`${this.raw}|${process.env.DATABASE_URL ?? ''}`);
  private readonly fails = new Map<string, number[]>();

  onModuleInit() {
    if (!this.enabled) this.log.log('Sign-in is OFF (APP_USERS not set): every route is open');
    else this.log.log(`Sign-in is ON: ${this.users.length} user(s) configured`);
    if (this.enabled && this.users.length === 0) this.log.warn('APP_USERS is set but has no valid email:bcryptHash entry');
  }

  /** True when this IP has used up its failed tries for the last minute. */
  limited(ip: string): boolean {
    const now = Date.now();
    const recent = (this.fails.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length) this.fails.set(ip, recent);
    else this.fails.delete(ip);
    return recent.length >= MAX_FAILS;
  }

  recordFail(ip: string) {
    this.fails.set(ip, [...(this.fails.get(ip) ?? []), Date.now()]);
  }

  /** Returns the normalised email when email and password match a configured user. */
  async check(email: string, password: string): Promise<string | null> {
    const wanted = sha(email.trim().toLowerCase());
    let match: User | undefined;
    for (const u of this.users) if (timingSafeEqual(sha(u.email), wanted) && !match) match = u;
    const ok = await bcrypt.compare(password, match?.hash ?? DUMMY_HASH);
    return ok && match ? match.email : null;
  }

  sign(email: string): string {
    const body = b64(JSON.stringify({ e: email, x: Date.now() + SESSION_MS }));
    return `${body}.${b64(createHmac('sha256', this.secret).update(body).digest())}`;
  }

  /** Email from a valid, unexpired token for a user that still exists; null for anything else. */
  verify(token: string | undefined): string | null {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const expected = createHmac('sha256', this.secret).update(body).digest();
    const given = Buffer.from(sig, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    try {
      const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { e?: unknown; x?: unknown };
      if (typeof p.e !== 'string' || typeof p.x !== 'number' || p.x <= Date.now()) return null;
      return this.users.some((u) => u.email === p.e) ? p.e : null;
    } catch {
      return null;
    }
  }
}
