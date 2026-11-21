import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Driver, DriverMe, DriverPairLink } from '@sm/contract';
import { DbService } from '../db/db.service';
import { hashToken, newToken } from '../auth/sessions.service';
import { StoresService } from '../stores/stores.service';

const LINK_MS = 30 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// last_ping_* and load from shipments and location_pings (#82).
const ROW = `
  select d.id, d.name, d.phone_e164, lp.taken_at as last_ping_at, lp.place as last_ping_place, ld.pieces, ld.to_location,
         case when not d.active then 'TURNED_OFF'
              when exists (select 1 from driver_devices v where v.driver_id = d.id and v.revoked_at is null) then 'PAIRED'
              when p.expires_at > now() then 'LINK_SENT'
              else 'LINK_EXPIRED' end as status,
         p.expires_at as link_expires_at
    from drivers d
    left join lateral (
      select expires_at from device_pairings where driver_id = d.id and used_at is null order by created_at desc limit 1
    ) p on true
    left join lateral (
      select x.taken_at, x.place from location_pings x join shipments s on s.id = x.shipment_id
       where s.driver_id = d.id order by x.taken_at desc limit 1
    ) lp on true
    left join lateral (
      select sum(l.qty)::int as pieces, min(r.to_location) as to_location
        from shipments s join transfer_requests r on r.id = s.request_id join transfer_lines l on l.request_id = r.id
       where s.driver_id = d.id and r.status in ('driver_assigned', 'on_the_way')
    ) ld on true`;

type Row = {
  id: string; name: string; phone_e164: string; status: Driver['status']; link_expires_at: Date | null;
  last_ping_at: Date | null; last_ping_place: string | null; pieces: number | null; to_location: string | null;
};

const asDriver = (r: Row): Driver => ({
  id: r.id,
  name: r.name,
  mobile: r.phone_e164.slice(-10),
  phone_e164: r.phone_e164,
  status: r.status,
  // Only while the driver is waiting on a link (live or expired).
  link_expires_at: r.link_expires_at && (r.status === 'LINK_SENT' || r.status === 'LINK_EXPIRED') ? r.link_expires_at.toISOString() : null,
  last_ping_at: r.last_ping_at ? r.last_ping_at.toISOString() : null,
  last_ping_place: r.last_ping_at ? r.last_ping_place : null,
  load: r.pieces ? { pieces: r.pieces, to: r.to_location! } : null,
});

/** "98073 11426", "+91 98073-11426", "09807311426" → "+919807311426", or null. */
function e164(input: unknown): string | null {
  let d = typeof input === 'string' ? input.replace(/\D/g, '') : '';
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}

/** $2 (signed-in manager), else whoever added the driver, else the store's active manager, else a generic name. */
const MANAGER = `
  left join lateral (
    select u.name, u.mobile from users u
     where u.id = coalesce($2::uuid, d.created_by) or (u.role = 'store_manager' and u.location_id = d.location_id and u.active)
     order by (u.id = coalesce($2::uuid, d.created_by)) is true desc, u.created_at limit 1
  ) m on true`;

@Injectable()
export class DriversService {
  constructor(
    private readonly db: DbService,
    private readonly stores: StoresService,
  ) {}

  /** "Kanpur KNP-03". */
  storeLabel(locationId: string) {
    const city = this.stores.cityOf(locationId);
    return city === locationId ? locationId : `${city} ${locationId}`;
  }

  async list(locationId: string): Promise<Driver[]> {
    const rows = await this.db.query<Row>(`${ROW} where d.location_id = $1 order by d.active desc, d.name`, [locationId]);
    return rows.map(asDriver);
  }

  async get(locationId: string, id: string): Promise<Driver> {
    const [row] = UUID.test(id) ? await this.db.query<Row>(`${ROW} where d.location_id = $1 and d.id = $2`, [locationId, id]) : [];
    if (!row) throw new NotFoundException({ error: 'No such driver at your store' });
    return asDriver(row);
  }

  async create(locationId: string, body: { name?: unknown; mobile?: unknown }, origin: string, by?: string) {
    const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
    if (!name || name.length > 80) throw new BadRequestException({ error: 'Type the driver’s name', message: 'Type the driver’s name' });
    const phone = e164(body.mobile);
    if (!phone) throw new BadRequestException({ error: 'Mobile number does not look right', message: 'Mobile number does not look right' });
    const [{ id }] = await this.db.query<{ id: string }>(
      `insert into drivers (location_id, name, phone_e164, created_by) values ($1, $2, $3, $4) returning id`,
      [locationId, name, phone, by ?? null],
    );
    return this.pairLink(locationId, id, origin, by);
  }

  /** New single-use link (30 min); any older unused link dies. Turns a turned-off driver back on. */
  async pairLink(locationId: string, id: string, origin: string, by?: string): Promise<DriverPairLink> {
    await this.get(locationId, id);
    await this.db.query(`update device_pairings set expires_at = now() where driver_id = $1 and used_at is null and expires_at > now()`, [id]);
    const token = newToken();
    await this.db.query(`insert into device_pairings (driver_id, token_hash, created_by, expires_at) values ($1, $2, $3, $4)`, [
      id, hashToken(token), by ?? null, new Date(Date.now() + LINK_MS),
    ]);
    await this.db.query(`update drivers set active = true where id = $1`, [id]);
    const driver = await this.get(locationId, id);
    const pair_url = `${origin}/pair#${token}`;
    const [m] = await this.db.query<{ name: string | null }>(`select m.name from drivers d ${MANAGER} where d.id = $1`, [id, by ?? null]);
    return { driver, pair_url, message: this.message(driver.name, pair_url, m?.name ?? 'Store manager', locationId) };
  }

  /** Every device off, every live link dead, driver shows as Turned off. */
  async revoke(locationId: string, id: string): Promise<Driver> {
    await this.get(locationId, id);
    await this.db.query(`update driver_devices set revoked_at = now() where driver_id = $1 and revoked_at is null`, [id]);
    await this.db.query(`update device_pairings set expires_at = now() where driver_id = $1 and used_at is null and expires_at > now()`, [id]);
    await this.db.query(`update drivers set active = false where id = $1`, [id]);
    return this.get(locationId, id);
  }

  /** Hindi line, English line, link, manager and store. */
  private message(name: string, url: string, manager: string, locationId: string) {
    const first = name.split(' ')[0];
    return [
      `नमस्ते ${first} जी, Stock Mover से जुड़ने के लिए नीचे का लिंक दबाएँ। लिंक 30 मिनट चलेगा।`,
      `Hello ${first}, tap the link below to join Stock Mover. The link works for 30 minutes.`,
      url,
      `— ${manager}, Manyavar ${this.storeLabel(locationId)}`,
    ].join('\n');
  }

  /** Who is adding this phone, for the Join screen. Reads the link without using it; null when used, expired or off. */
  async preview(token: string): Promise<Pick<DriverMe, 'name' | 'store' | 'manager_name'> | null> {
    if (!token || token.length > 100) return null;
    const [r] = await this.db.query<{ name: string; location_id: string; m_name: string | null }>(
      `select d.name, d.location_id, m.name as m_name
         from device_pairings p join drivers d on d.id = p.driver_id ${MANAGER}
        where p.token_hash = $1 and p.used_at is null and p.expires_at > now() and d.active`,
      [hashToken(token), null],
    );
    return r ? { name: r.name, store: this.storeLabel(r.location_id), manager_name: r.m_name ?? 'Store manager' } : null;
  }

  /** Uses the link once (atomic). Returns the new device token, or null when the link is used, expired or off. */
  async pair(token: string, userAgent?: string): Promise<string | null> {
    if (!token || token.length > 100) return null;
    const [hit] = await this.db.query<{ driver_id: string }>(
      `update device_pairings p set used_at = now()
         from drivers d
        where p.token_hash = $1 and p.used_at is null and p.expires_at > now() and d.id = p.driver_id and d.active
        returning p.driver_id`,
      [hashToken(token)],
    );
    if (!hit) return null;
    const device = newToken();
    await this.db.query(`insert into driver_devices (driver_id, token_hash, user_agent) values ($1, $2, $3)`, [
      hit.driver_id, hashToken(device), userAgent?.slice(0, 300) ?? null,
    ]);
    return device;
  }

  async me(driverId: string): Promise<DriverMe> {
    const [r] = await this.db.query<{ name: string; lang: DriverMe['lang']; location_id: string; m_name: string | null; m_phone: string | null }>(
      `select d.name, d.lang, d.location_id, m.name as m_name, m.mobile as m_phone from drivers d ${MANAGER} where d.id = $1`,
      [driverId, null],
    );
    return {
      name: r.name,
      lang: r.lang,
      store: this.storeLabel(r.location_id),
      manager_name: r.m_name ?? 'Store manager',
      manager_phone: r.m_phone ?? '',
    };
  }

  async setLang(driverId: string, lang: unknown) {
    if (lang !== 'hi' && lang !== 'en') throw new BadRequestException({ error: "lang must be 'hi' or 'en'" });
    await this.db.query(`update drivers set lang = $2 where id = $1`, [driverId, lang]);
  }
}
