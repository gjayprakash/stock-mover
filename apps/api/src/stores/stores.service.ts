import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { NearestLocation, NewStoreRequest } from '@sm/contract';
import { DbService } from '../db/db.service';
import type { Store } from '../engine/data';
import type { LatLng } from '../geo/distance';
import { GeoService } from '../geo/geo.service';

// apps/api/dist/stores -> repo root.
const STORES_CSV = join(__dirname, '..', '..', '..', '..', 'data', 'csv', 'stores.csv');
const WAREHOUSE = { id: 'WH-KOL', city: 'Kolkata' };
const TIERS = ['S++', 'S+', 'A', 'B'];
const CODE = /^[A-Z]{3}-\d{2}$/;

type FieldError = { field: string; message: string };

@Injectable()
export class StoresService implements OnModuleInit {
  private readonly csvStores: Store[] = (() => {
    const [head, ...rows] = readFileSync(STORES_CSV, 'utf8').trim().split(/\r?\n/);
    const cols = head.split(',');
    return rows.map((line) => {
      const r = Object.fromEntries(line.split(',').map((v, i) => [cols[i], v.trim()]));
      return {
        store_id: r.store_id, city: r.city, state: r.state, zone: r.zone, tier: r.tier,
        size_sqft: Number(r.size_sqft), stock_capacity_units: Number(r.stock_capacity_units),
        opened_on: r.opened_on, area_manager_id: r.area_manager_id,
      };
    });
  })();
  private added: Store[] = [];

  constructor(
    private readonly db: DbService,
    private readonly geo: GeoService,
  ) {}

  async onModuleInit() {
    if (!this.db.configured) return;
    await this.db.query(`
      create table if not exists stores_added (
        store_id text primary key, city text not null, state text not null, zone text not null, tier text not null,
        stock_capacity_units int not null, opened_on date not null, pin text not null, address text not null,
        lat double precision not null, lng double precision not null, created_at timestamptz not null default now()
      )`);
    const rows = await this.db.query<Store & { opened_on: string }>(
      `select store_id, city, state, zone, tier, stock_capacity_units, opened_on::text as opened_on from stores_added order by created_at`,
    );
    this.added = rows.map((r) => ({ ...r, size_sqft: 0, area_manager_id: '' }));
  }

  /** Same columns as stores.csv; passed to the engine as EngineInput.extraStores. */
  extraStores(): Store[] {
    return [...this.added];
  }

  private allStores() {
    return [...this.csvStores, ...this.added];
  }

  cityOf(id: string) {
    return id === WAREHOUSE.id ? WAREHOUSE.city : this.allStores().find((s) => s.store_id === id)?.city ?? id;
  }

  /** 5 closest stores + WH-KOL + the farthest, closest first. */
  nearest(point: LatLng, exclude?: string): NearestLocation[] {
    const all = this.geo.nearest(point, Infinity, exclude);
    const stores = all.filter((r) => r.location_id !== WAREHOUSE.id);
    const pick = new Set([...stores.slice(0, 5), all.find((r) => r.location_id === WAREHOUSE.id), stores[stores.length - 1]]);
    return all
      .filter((r) => pick.has(r))
      .map((r) => ({ location_id: r.location_id, city: this.cityOf(r.location_id), distance_km: r.distance_km, travel_days: r.travel_days }));
  }

  /** Next free CITY-NN. A city that already has a store keeps its prefix (Bengaluru → BLR, Lucknow → LKO).
   *  A new city gets the first 3 letters, or, if another city already uses those, the first letter + 2 later
   *  letters in order (e.g. a new "Mysore" would skip MYS and take MYO). */
  nextCode(city: string): string {
    const letters = city.replace(/[^a-z]/gi, '').toUpperCase();
    if (letters.length < 3) throw new BadRequestException({ errors: [{ field: 'city', message: 'city needs at least 3 letters' }] });
    const stores = this.allStores();
    const prefixOf = (id: string) => id.slice(0, id.indexOf('-'));
    const key = (c: string) => c.replace(/[^a-z]/gi, '').toUpperCase();
    let prefix = stores.find((s) => key(s.city) === letters && CODE.test(s.store_id))?.store_id.slice(0, 3);
    if (!prefix) {
      const taken = new Set([...stores.map((s) => prefixOf(s.store_id)), prefixOf(WAREHOUSE.id)]);
      const candidates: string[] = [];
      for (let j = 1; j < letters.length; j++)
        for (let k = j + 1; k < letters.length; k++) candidates.push(letters[0] + letters[j] + letters[k]);
      prefix = candidates.find((p) => !taken.has(p));
      if (!prefix) throw new BadRequestException({ errors: [{ field: 'city', message: 'No free code for this city; type one in' }] });
    }
    const used = stores
      .map((s) => s.store_id)
      .filter((id) => id.startsWith(prefix + '-'))
      .map((id) => Number(id.slice(4)));
    return `${prefix}-${String(Math.max(0, ...used) + 1).padStart(2, '0')}`;
  }

  // TODO auth: no sign-in yet (#19); anyone with the URL can add a store.
  async create(body: Partial<Record<keyof NewStoreRequest, unknown>>) {
    const errors: FieldError[] = [];
    const str = (k: keyof NewStoreRequest) => (typeof body[k] === 'string' ? (body[k] as string).trim() : '');
    const store_id = str('store_id').toUpperCase();
    const city = str('city');
    const tier = str('tier');
    const opened_on = str('opened_on');
    const pin = str('pin');
    const address = str('address');
    const capacity = body.capacity;
    const lat = Number(body.lat);
    const lng = Number(body.lng);

    if (!CODE.test(store_id)) errors.push({ field: 'store_id', message: 'Store code must look like ABC-01' });
    else if (this.allStores().some((s) => s.store_id === store_id) || store_id === WAREHOUSE.id)
      errors.push({ field: 'store_id', message: 'This code is already used' });
    if (!city) errors.push({ field: 'city', message: 'City is required' });
    if (!TIERS.includes(tier)) errors.push({ field: 'tier', message: 'Store type must be S++, S+, A or B' });
    if (typeof capacity !== 'number' || !Number.isInteger(capacity) || capacity < 100 || capacity > 10000)
      errors.push({ field: 'capacity', message: 'Space for stock must be a whole number from 100 to 10,000' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(opened_on) || Number.isNaN(Date.parse(opened_on + 'T00:00:00Z')))
      errors.push({ field: 'opened_on', message: 'Opening date must be a date (YYYY-MM-DD)' });
    if (!/^\d{6}$/.test(pin)) errors.push({ field: 'pin', message: 'PIN code must be 6 digits' });
    if (!address) errors.push({ field: 'address', message: 'Address is required' });
    if (body.lat === undefined || body.lat === null || body.lat === '' || !Number.isFinite(lat) || lat < -90 || lat > 90)
      errors.push({ field: 'lat', message: 'Latitude must be a number from -90 to 90' });
    if (body.lng === undefined || body.lng === null || body.lng === '' || !Number.isFinite(lng) || lng < -180 || lng > 180)
      errors.push({ field: 'lng', message: 'Longitude must be a number from -180 to 180' });
    if (errors.length) throw new BadRequestException({ errors });

    // State + zone from the PIN. ASSUMPTION: unknown PIN or a state outside North/East/South → take them from the
    // nearest existing store, so the engine always has a warehouse lead time for the new store.
    const point = { lat, lng };
    const info = this.geo.lookupPin(pin);
    let state = info?.state ?? '';
    let zone = info?.zone ?? null;
    if (!zone) {
      const near = this.geo.nearest(point, Infinity).find((r) => r.location_id !== WAREHOUSE.id)!;
      const s = this.allStores().find((x) => x.store_id === near.location_id)!;
      state = s.state;
      zone = s.zone;
    }
    const store: Store = {
      store_id, city, state, zone, tier, size_sqft: 0, stock_capacity_units: capacity as number, opened_on, area_manager_id: '',
    };
    if (this.db.configured) {
      await this.db.query(
        `insert into stores_added (store_id, city, state, zone, tier, stock_capacity_units, opened_on, pin, address, lat, lng)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [store_id, city, state, zone, tier, capacity, opened_on, pin, address, lat, lng],
      );
    }
    this.added.push(store);
    await this.geo.addLocation(store_id, pin, point, 'added');
    return { store: { ...store, pin, address, lat, lng }, nearest: this.nearest(point, store_id) };
  }
}
