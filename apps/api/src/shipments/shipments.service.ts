import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { join } from 'path';
import type { DriverTrip, Shipment, ShipmentStatus } from '@sm/contract';
import { leadTime, parseLeadTimes } from '../engine/clean';
import { readTable, type Store } from '../engine/data';
import { addDays } from '../engine/dates';
import type { Transfer } from '../engine/position';
import { DbService } from '../db/db.service';
import { GeoService } from '../geo/geo.service';
import { StockService } from '../stock/stock.service';
import { StoresService } from '../stores/stores.service';

const DATA_DIR = join(__dirname, '..', '..', '..', '..', 'data', 'csv');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LATE_PING_MS = 24 * 3600_000;
/** Shipment status (API, web) → transfer_requests.status (#79 names). */
const DB: Record<ShipmentStatus, string> = {
  approved: 'approved', assigned: 'driver_assigned', in_transit: 'on_the_way', delivered: 'delivered', received: 'received',
};
/** Request statuses that have a shipment (#79 creates it on approve). */
const SHIPPING = Object.values(DB);

const APPROVED_AT = `coalesce(r.approved_at, r.updated_at)`;

/** One row per shipment: the request, its lines folded (one SKU per request today), driver, last 20 pings. */
const ROW = `
  select s.id, s.request_id, r.from_location, r.to_location, r.value_mrp,
         case r.status when 'driver_assigned' then 'assigned' when 'on_the_way' then 'in_transit' else r.status end as status, r.created_at as requested_at,
         ${APPROVED_AT} as approved_at, s.picked_up_at, s.delivered_at, s.received_at, s.qty_received,
         l.sku_id, l.qty, d.id as driver_id, d.name as driver_name, d.phone_e164 as driver_phone, p.pings
    from shipments s
    join transfer_requests r on r.id = s.request_id
    join lateral (select min(sku_id) as sku_id, sum(qty)::int as qty from transfer_lines where request_id = r.id) l on true
    left join drivers d on d.id = s.driver_id
    left join lateral (
      select json_agg(json_build_object('place', coalesce(x.place, ''), 'lat', x.lat, 'lng', x.lng, 'taken_at', x.taken_at) order by x.taken_at desc) as pings
        from (select * from location_pings where shipment_id = s.id order by taken_at desc limit 20) x
    ) p on true`;

type Row = {
  id: string; request_id: string; from_location: string; to_location: string; status: ShipmentStatus; value_mrp: number;
  requested_at: Date; approved_at: Date; picked_up_at: Date | null; delivered_at: Date | null; received_at: Date | null;
  qty_received: number | null; sku_id: string; qty: number;
  driver_id: string | null; driver_name: string | null; driver_phone: string | null;
  pings: { place: string; lat: number; lng: number; taken_at: string }[] | null;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);
/** Calendar date in India for a timestamp. */
const istDay = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

@Injectable()
export class ShipmentsService {
  private items = new Map<string, { style_name: string; size: string }>(
    readTable(DATA_DIR, 'items', ['sku_id', 'style_name', 'size']).map((r) => [r.sku_id, { style_name: r.style_name, size: r.size }]),
  );
  private readonly csvStores = readTable(DATA_DIR, 'stores', ['store_id', 'city', 'zone']) as unknown as Store[];
  private readonly leadTimes = parseLeadTimes(
    readTable(DATA_DIR, 'lead_times', ['route', 'days']).map((r) => ({ route: r.route, days: Number(r.days) })),
  );

  constructor(
    private readonly db: DbService,
    private readonly geo: GeoService,
    private readonly stores: StoresService,
    private readonly stock: StockService,
  ) {}

  /** Same lead time the engine uses (lead_times tab by city / zone). */
  private leadDays(from: string, to: string): number {
    const all = new Map([...this.csvStores, ...this.stores.extraStores()].map((s) => [s.store_id, s]));
    try {
      return leadTime(from, to, all, this.leadTimes);
    } catch {
      return this.leadTimes.otherZone;
    }
  }

  private item(sku: string) {
    return this.items.get(sku) ?? this.stock.extraItems().find((x) => x.sku_id === sku) ?? { style_name: sku, size: '' };
  }

  private asShipment(r: Row): Shipment {
    const days = this.leadDays(r.from_location, r.to_location);
    const it = this.item(r.sku_id);
    return {
      id: r.id, request_id: r.request_id, sku_id: r.sku_id, style_name: it.style_name, size: it.size,
      qty: r.qty, value_mrp: Number(r.value_mrp), from_id: r.from_location, to_id: r.to_location, status: r.status,
      due_date: addDays(istDay(r.approved_at), days), lead_time_days: days,
      driver: r.driver_id ? { id: r.driver_id, name: r.driver_name!, phone_e164: r.driver_phone! } : null,
      requested_at: r.requested_at.toISOString(), approved_at: r.approved_at.toISOString(),
      picked_up_at: iso(r.picked_up_at), delivered_at: iso(r.delivered_at), received_at: iso(r.received_at),
      qty_received: r.qty_received,
      pings: (r.pings ?? []).map((p) => ({ ...p, taken_at: new Date(p.taken_at).toISOString() })),
    };
  }

  /** Incoming (to my store) or outgoing (from my store). Received ones stay 7 days. */
  async list(store: string, dir: 'in' | 'out') {
    const rows = await this.db.query<Row>(
      `${ROW} where r.status = any($2) and r.${dir === 'in' ? 'to_location' : 'from_location'} = $1
          and (r.status <> 'received' or s.received_at > now() - interval '7 days')
        order by r.status = 'received', approved_at desc`,
      [store, SHIPPING],
    );
    return { store_id: store, shipments: rows.map((r) => this.asShipment(r)) };
  }

  private async one(id: string): Promise<Row | null> {
    if (!UUID.test(id)) return null;
    const [row] = await this.db.query<Row>(`${ROW} where s.id = $1`, [id]);
    return row ?? null;
  }

  /** Guarded status change (stale clicks change nothing) + a transfer_events row (actor = user id; null for the driver's phone). */
  private async step(requestId: string, from: ShipmentStatus[], to: ShipmentStatus, actor: string | null, note: string | null = null) {
    const [hit] = await this.db.query<{ was: string }>(
      `update transfer_requests r set status = $3, updated_at = now()
         from (select id, status as was from transfer_requests where id = $1 for update) o
        where r.id = o.id and o.was = any($2) returning o.was`,
      [requestId, from.map((f) => DB[f]), DB[to]],
    );
    if (!hit) return false;
    await this.db.query(
      `insert into transfer_events (request_id, actor, from_status, to_status, at, note) values ($1, $2, $3, $4, now(), $5)`,
      [requestId, actor, hit.was, DB[to], note],
    );
    return true;
  }

  /** Giving store's manager picks one of the store's paired drivers. Re-assigning an assigned shipment swaps the driver. */
  async assign(store: string, id: string, driverId: unknown, by: string | undefined): Promise<Shipment> {
    const s = await this.one(id);
    if (!s || s.from_location !== store) throw new ForbiddenException({ error: 'Not a shipment from your store' });
    if (typeof driverId !== 'string' || !UUID.test(driverId)) throw new BadRequestException({ error: 'Pick a driver' });
    const [ok] = await this.db.query(
      `select 1 from drivers d where d.id = $1 and d.location_id = $2 and d.active
          and exists (select 1 from driver_devices v where v.driver_id = d.id and v.revoked_at is null)`,
      [driverId, store],
    );
    if (!ok) throw new BadRequestException({ error: 'Pick a paired driver of your store' });
    const actor = by ?? null;
    if (s.status === 'approved') {
      if (!(await this.step(s.request_id, ['approved'], 'assigned', actor))) throw new ConflictException({ error: 'This shipment changed. Refresh.' });
    } else if (s.status === 'assigned') {
      if (s.driver_id === driverId) return this.asShipment(s);
      await this.db.query(
        `insert into transfer_events (request_id, actor, from_status, to_status, at, note) values ($1, $2, 'driver_assigned', 'driver_assigned', now(), 'driver changed')`,
        [s.request_id, actor],
      );
    } else {
      throw new ConflictException({ error: 'The driver has already picked this up' });
    }
    await this.db.query(`update shipments set driver_id = $2, assigned_by = $3, assigned_at = now() where id = $1`, [id, driverId, by ?? null]);
    return this.asShipment((await this.one(id))!);
  }

  /** Receiving manager counts what arrived. A short count is written to transfer_events and shows to the giver. */
  async receive(store: string, id: string, qtyIn: unknown, by: string | undefined): Promise<Shipment> {
    const s = await this.one(id);
    if (!s || s.to_location !== store) throw new ForbiddenException({ error: 'Not a shipment to your store' });
    const qty = Number(qtyIn);
    if (!Number.isInteger(qty) || qty < 0 || qty > s.qty) throw new BadRequestException({ error: `Count must be 0 to ${s.qty}` });
    const note = qty < s.qty ? `short: received ${qty} of ${s.qty}` : `received ${qty} of ${s.qty}`;
    if (!(await this.step(s.request_id, ['in_transit', 'delivered'], 'received', by ?? null, note))) {
      throw new ConflictException({ error: s.status === 'received' ? 'Already received' : 'Not on the way yet' });
    }
    await this.db.query(
      `update shipments set received_by = $2, received_at = now(), qty_received = $3, delivered_at = coalesce(delivered_at, now()) where id = $1`,
      [id, by ?? null, qty],
    );
    return this.asShipment((await this.one(id))!);
  }

  // ---- Driver phone (device cookie) ----

  async trips(driverId: string): Promise<DriverTrip[]> {
    const rows = await this.db.query<{
      id: string; status: string; from_location: string; to_location: string; pieces: number;
      manager_phone: string | null; last_ping_at: Date | null;
    }>(
      `select s.id, r.status, r.from_location, r.to_location,
              (select sum(qty)::int from transfer_lines where request_id = r.id) as pieces,
              coalesce(
                (select u.mobile from users u where u.id = s.assigned_by and u.mobile is not null and u.mobile <> ''),
                (select u.mobile from users u join drivers d on d.created_by = u.id
                  where d.id = s.driver_id and u.mobile is not null and u.mobile <> ''),
                (select u.mobile from users u where u.role = 'store_manager' and u.location_id = r.from_location and u.active
                  and u.mobile is not null and u.mobile <> '' order by u.created_at limit 1)
              ) as manager_phone,
              (select max(taken_at) from location_pings where shipment_id = s.id) as last_ping_at
         from shipments s join transfer_requests r on r.id = s.request_id
        where s.driver_id = $1 and r.status in ('driver_assigned', 'on_the_way')
        order by r.status = 'driver_assigned', s.assigned_at`,
      [driverId],
    );
    return rows.map((r) => ({
      id: r.id, status: r.status === 'on_the_way' ? 'in_transit' : 'assigned',
      from_store_id: r.from_location, from_store_name: this.stores.cityOf(r.from_location),
      to_store_id: r.to_location, to_store_name: this.stores.cityOf(r.to_location),
      pieces: r.pieces, manager_phone: r.manager_phone ?? '', last_ping_at: iso(r.last_ping_at),
    }));
  }

  /** The driver's oldest shipment in this status. */
  private async driverShipment(driverId: string, status: 'assigned' | 'in_transit') {
    const [s] = await this.db.query<{ id: string; request_id: string }>(
      `select s.id, s.request_id from shipments s join transfer_requests r on r.id = s.request_id
        where s.driver_id = $1 and r.status = $2 order by s.assigned_at limit 1`,
      [driverId, DB[status]],
    );
    return s ?? null;
  }

  async pickedUp(driverId: string) {
    const s = await this.driverShipment(driverId, 'assigned');
    if (!s || !(await this.step(s.request_id, ['assigned'], 'in_transit', null, `driver ${driverId}`))) {
      throw new ConflictException({ error: 'No trip waiting to be picked up' });
    }
    await this.db.query(`update shipments set picked_up_at = now() where id = $1`, [s.id]);
  }

  /** One ping goes on every shipment the driver is carrying. Pings older than 24 h (or from the future) are dropped. */
  async ping(driverId: string, deviceId: string, body: { lat?: unknown; lng?: unknown; accuracy?: unknown; taken_at?: unknown }) {
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new BadRequestException({ error: 'lat / lng look wrong' });
    }
    const takenAt = typeof body.taken_at === 'string' ? new Date(body.taken_at) : new Date();
    const age = Date.now() - takenAt.getTime();
    if (!Number.isFinite(age) || age > LATE_PING_MS || age < -5 * 60_000) return;
    const accuracy = Number(body.accuracy);
    await this.db.query(
      `insert into location_pings (shipment_id, device_id, lat, lng, accuracy_m, place, taken_at)
       select s.id, $2, $3, $4, $5, $6, $7 from shipments s join transfer_requests r on r.id = s.request_id
        where s.driver_id = $1 and r.status in ('driver_assigned', 'on_the_way')`,
      [driverId, deviceId, lat, lng, Number.isFinite(accuracy) ? accuracy : null, this.geo.placeNear({ lat, lng }), takenAt],
    );
  }

  async delivered(driverId: string) {
    const s = await this.driverShipment(driverId, 'in_transit');
    if (!s || !(await this.step(s.request_id, ['in_transit'], 'delivered', null, `driver ${driverId}`))) {
      throw new ConflictException({ error: 'No trip on the way' });
    }
    await this.db.query(`update shipments set delivered_at = now() where id = $1`, [s.id]);
  }

  /** Rule 3 for the daily run: every approved … received transfer, per SKU line. */
  async engineTransfers(): Promise<Transfer[]> {
    if (!this.db.configured) return [];
    const rows = await this.db.query<{ from: string; to: string; sku_id: string; qty: number; approved_on: string; qty_received: number | null }>(
      `select r.from_location as "from", r.to_location as "to", l.sku_id, l.qty,
              to_char(${APPROVED_AT} at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as approved_on,
              case when r.status = 'received' then least(l.qty, coalesce(s.qty_received, l.qty)) end as qty_received
         from transfer_requests r
         join transfer_lines l on l.request_id = r.id
         left join shipments s on s.request_id = r.id
        where r.status = any($1)`,
      [SHIPPING],
    );
    return rows;
  }
}
