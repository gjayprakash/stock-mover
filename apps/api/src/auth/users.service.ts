import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { UserRow } from '@sm/contract';
import { DbService } from '../db/db.service';
import { hashToken, newToken } from './sessions.service';

const INVITE_MS = 24 * 60 * 60 * 1000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE = /^\+?[0-9][0-9 -]{8,16}[0-9]$/;

const ROW = `
  select u.id, u.name, u.email, u.mobile, u.role, u.location_id, u.created_at, u.last_sign_in_at,
         case when not u.active then 'Turned off' when u.password_hash is null then 'Invite sent' else 'Active' end as status
    from users u`;

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

@Injectable()
export class UsersService {
  constructor(private readonly db: DbService) {}

  /** Active user with a password, for sign-in. */
  async forLogin(email: string) {
    const [u] = await this.db.query<{ id: string; password_hash: string }>(
      `select id, password_hash from users where email = $1 and active and password_hash is not null`,
      [email.trim().toLowerCase()],
    );
    return u ?? null;
  }

  list() {
    return this.db.query<UserRow>(`${ROW} order by (u.role = 'super_admin') desc, u.created_at`);
  }

  private async row(id: string) {
    const [u] = await this.db.query<UserRow>(`${ROW} where u.id = $1`, [id]);
    return u;
  }

  /** Store managers only: the one super admin is made by scripts/seed-admin.ts and cannot be changed here. */
  private async manager(id: string) {
    const u = /^[0-9a-f-]{36}$/i.test(id) ? await this.row(id) : undefined;
    if (!u || u.role !== 'store_manager') throw new NotFoundException({ error: 'No such store manager' });
    return u;
  }

  private async checkLocation(v: unknown): Promise<string> {
    const id = text(v).toUpperCase();
    const [hit] = id ? await this.db.query(`select 1 from store_locations where location_id = $1`, [id]) : [];
    if (!hit) throw new BadRequestException({ error: 'Pick a store or the warehouse that exists' });
    return id;
  }

  async create(body: Record<string, unknown>, createdBy: string) {
    const name = text(body.name);
    const email = text(body.email).toLowerCase();
    const mobile = text(body.mobile);
    if (!name || name.length > 100) throw new BadRequestException({ error: 'Name is needed (at most 100 characters)' });
    if (!EMAIL.test(email) || email.length > 254) throw new BadRequestException({ error: 'Email does not look right' });
    if (!MOBILE.test(mobile)) throw new BadRequestException({ error: 'Mobile number does not look right' });
    const location = await this.checkLocation(body.location_id);
    const [taken] = await this.db.query(`select 1 from users where email = $1`, [email]);
    if (taken) throw new ConflictException({ error: 'That email already has a user' });
    const [{ id }] = await this.db.query<{ id: string }>(
      `insert into users (email, name, mobile, role, location_id, created_by)
       values ($1, $2, $3, 'store_manager', $4, $5) returning id`,
      [email, name, mobile, location, createdBy],
    );
    const token = await this.newInvite(id);
    return { user: await this.row(id), token };
  }

  async update(id: string, body: Record<string, unknown>) {
    await this.manager(id);
    const hasLocation = body.location_id !== undefined;
    const hasActive = body.active !== undefined;
    if (!hasLocation && !hasActive) throw new BadRequestException({ error: 'Send location_id or active' });
    if (hasActive && typeof body.active !== 'boolean') throw new BadRequestException({ error: 'active must be true or false' });
    if (hasLocation) await this.db.query(`update users set location_id = $2 where id = $1`, [id, await this.checkLocation(body.location_id)]);
    if (hasActive) {
      await this.db.query(`update users set active = $2 where id = $1`, [id, body.active]);
      // Turned off: signed out everywhere at once.
      if (body.active === false) await this.db.query(`delete from sessions where user_id = $1`, [id]);
    }
    return this.row(id);
  }

  /** Fresh single-use link; any earlier unused link for this user stops working. */
  async invite(id: string) {
    const u = await this.manager(id);
    if (u.status === 'Turned off') throw new ConflictException({ error: 'Turn this user on first' });
    return this.newInvite(id);
  }

  private async newInvite(userId: string) {
    const token = newToken();
    await this.db.query(`delete from invites where user_id = $1 and used_at is null`, [userId]);
    await this.db.query(`insert into invites (token_hash, user_id, expires_at) values ($1, $2, $3)`, [
      hashToken(token), userId, new Date(Date.now() + INVITE_MS),
    ]);
    return token;
  }

  /** Uses the invite (once, unexpired, active user) and sets the password in one statement. Returns the user id or null. */
  async acceptInvite(token: string, passwordHash: string): Promise<string | null> {
    if (token.length > 100) return null;
    const [row] = await this.db.query<{ id: string }>(
      `with used as (
         update invites i set used_at = now()
           from users u
          where i.token_hash = $1 and i.used_at is null and i.expires_at > now() and u.id = i.user_id and u.active
          returning i.user_id)
       update users set password_hash = $2 from used where users.id = used.user_id returning users.id`,
      [hashToken(token), passwordHash],
    );
    if (!row) return null;
    // A new password ends any older session.
    await this.db.query(`delete from sessions where user_id = $1`, [row.id]);
    return row.id;
  }
}
