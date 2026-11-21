import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Role, UserRow } from '@sm/contract';
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

  private async user(id: string) {
    const u = /^[0-9a-f-]{36}$/i.test(id) ? await this.row(id) : undefined;
    if (!u) throw new NotFoundException({ error: 'No such user' });
    return u;
  }

  private async checkLocation(v: unknown): Promise<string> {
    const id = text(v).toUpperCase();
    const [hit] = id ? await this.db.query(`select 1 from store_locations where location_id = $1`, [id]) : [];
    if (!hit) throw new BadRequestException({ error: 'Pick a store or the warehouse that exists' });
    return id;
  }

  /** One email, one role: a 409 that says which role the email already has, or null when it is free. */
  private async taken(email: string) {
    const [u] = await this.db.query<{ role: Role; location_id: string | null }>(
      `select role, location_id from users where email = $1`,
      [email],
    );
    if (!u) return null;
    return new ConflictException({
      error: u.role === 'super_admin' ? 'That email is already a super admin' : `That email is already a store manager for ${u.location_id}`,
    });
  }

  /** Adds a super admin or a store manager by email. Only the email is required, plus the store for a store manager. */
  async create(body: Record<string, unknown>, createdBy: string) {
    const role = body.role === undefined || body.role === null || body.role === '' ? 'store_manager' : body.role;
    if (role !== 'super_admin' && role !== 'store_manager') throw new BadRequestException({ error: 'role must be super_admin or store_manager' });
    const email = text(body.email).toLowerCase();
    if (!EMAIL.test(email) || email.length > 254) throw new BadRequestException({ error: 'Email does not look right' });
    const name = text(body.name) || email.split('@')[0];
    if (name.length > 100) throw new BadRequestException({ error: 'Name is at most 100 characters' });
    const mobile = text(body.mobile) || null;
    if (mobile && !MOBILE.test(mobile)) throw new BadRequestException({ error: 'Mobile number does not look right' });
    // A super admin sees everything: any location_id sent is ignored.
    const location = role === 'store_manager' ? await this.checkLocation(body.location_id) : null;
    const clash = await this.taken(email);
    if (clash) throw clash;
    let id: string;
    try {
      [{ id }] = await this.db.query<{ id: string }>(
        `insert into users (email, name, mobile, role, location_id, created_by)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [email, name, mobile, role, location, createdBy],
      );
    } catch (e) {
      // Two adds of one email at once: the unique email constraint lets only one through.
      if ((e as { code?: string }).code === '23505') throw (await this.taken(email)) ?? new ConflictException({ error: 'That email already has a user' });
      throw e;
    }
    const token = await this.newInvite(id);
    return { user: await this.row(id), token };
  }

  /**
   * Change a store manager's store, or turn anyone off or on. Safety rules: you cannot turn yourself off,
   * and the last active super admin can never be turned off (checked under a lock, so two requests cannot race past it).
   */
  async update(id: string, body: Record<string, unknown>, actorId: string) {
    const u = await this.user(id);
    const hasLocation = body.location_id !== undefined;
    const hasActive = body.active !== undefined;
    if (!hasLocation && !hasActive) throw new BadRequestException({ error: 'Send location_id or active' });
    if (hasActive && typeof body.active !== 'boolean') throw new BadRequestException({ error: 'active must be true or false' });
    if (hasLocation && u.role !== 'store_manager') throw new BadRequestException({ error: 'Only a store manager has a store' });
    if (body.active === false && id === actorId) throw new ConflictException({ error: 'You cannot turn yourself off' });
    if (hasLocation) await this.db.query(`update users set location_id = $2 where id = $1`, [id, await this.checkLocation(body.location_id)]);
    if (body.active === true) await this.db.query(`update users set active = true where id = $1`, [id]);
    if (body.active === false) {
      await this.db.tx(async (q) => {
        // One turn-off at a time. The count is a later statement than the lock, so it sees every turn-off committed before it.
        await q(`select pg_advisory_xact_lock(hashtext('stock-mover:users:turn-off'))`);
        const [t] = await q<{ role: Role; others: number }>(
          `select role, (select count(*)::int from users where role = 'super_admin' and active and id <> $1) as others
             from users where id = $1`,
          [id],
        );
        if (t?.role === 'super_admin' && t.others === 0) {
          throw new ConflictException({ error: 'This is the last active super admin. Add or turn on another super admin first.' });
        }
        await q(`update users set active = false where id = $1`, [id]);
        // Turned off: signed out everywhere at once.
        await q(`delete from sessions where user_id = $1`, [id]);
      });
    }
    return this.row(id);
  }

  /** Fresh single-use link; any earlier unused link for this user stops working. Super admins and store managers alike. */
  async invite(id: string) {
    const u = await this.user(id);
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
