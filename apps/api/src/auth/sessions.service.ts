import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { Me } from '@sm/contract';
import { DbService } from '../db/db.service';
import { SESSION_MS } from './http';

/** 256-bit random token for cookies and invite links; only its SHA-256 is stored. */
export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest();

const TOUCH_AFTER = "interval '5 minutes'";

@Injectable()
export class SessionsService {
  constructor(private readonly db: DbService) {}

  async create(userId: string, userAgent?: string): Promise<string> {
    const token = newToken();
    await this.db.query(`delete from sessions where expires_at < now()`);
    await this.db.query(`insert into sessions (token_hash, user_id, expires_at, user_agent) values ($1, $2, $3, $4)`, [
      hashToken(token), userId, new Date(Date.now() + SESSION_MS), userAgent?.slice(0, 300) ?? null,
    ]);
    await this.db.query(`update users set last_sign_in_at = now() where id = $1`, [userId]);
    return token;
  }

  /** The active user behind a live session, or null. */
  async user(token: string): Promise<Me | null> {
    if (!this.db.configured || token.length > 100) return null;
    const hash = hashToken(token);
    const [row] = await this.db.query<Me & { stale: boolean }>(
      `select u.id, u.name, u.email, u.role, u.location_id, s.last_seen_at < now() - ${TOUCH_AFTER} as stale
         from sessions s join users u on u.id = s.user_id
        where s.token_hash = $1 and s.expires_at > now() and u.active`,
      [hash],
    );
    if (!row) return null;
    if (row.stale) await this.db.query(`update sessions set last_seen_at = now() where token_hash = $1`, [hash]);
    const { stale: _stale, ...me } = row;
    return me;
  }

  async end(token: string) {
    await this.db.query(`delete from sessions where token_hash = $1`, [hashToken(token)]);
  }

  async endAll(userId: string) {
    await this.db.query(`delete from sessions where user_id = $1`, [userId]);
  }
}
