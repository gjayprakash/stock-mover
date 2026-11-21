import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DbService } from '../db/db.service';
import { haversineKm, roadKm, travelDays, type LatLng } from './distance';

// apps/api/dist/geo -> repo root.
const GEO_DIR = join(__dirname, '..', '..', '..', '..', 'data', 'geo');

const ZONES: Record<string, string> = { 'Uttar Pradesh': 'North', Bihar: 'East', Karnataka: 'South' };

export type PinInfo = { pin: string; place: string; city: string; state: string; zone: string | null; lat: number; lng: number };
export type NearestRow = { location_id: string; distance_km: number; travel_days: number };

function readCsv(file: string): Record<string, string>[] {
  const [head, ...rows] = readFileSync(join(GEO_DIR, file), 'utf8').trim().split(/\r?\n/);
  const cols = head.split(',');
  return rows.map((r) => Object.fromEntries(r.split(',').map((v, i) => [cols[i], v.trim()])));
}

/**
 * Store locations + pairwise distances. Bundled PIN table (data/geo/pincodes.csv), store_locations and
 * store_distances tables in Postgres, seeded from data/geo/store_locations.csv on first boot.
 * Without DATABASE_URL it works from the CSVs in memory.
 */
@Injectable()
export class GeoService implements OnModuleInit {
  private readonly log = new Logger('Geo');
  private readonly pins = new Map<string, PinInfo>(
    readCsv('pincodes.csv').map((r) => [
      r.pin,
      {
        pin: r.pin,
        place: r.place,
        city: r.place.replace(/ (GPO|Head Office)$/, ''),
        state: r.state,
        zone: ZONES[r.state] ?? null,
        lat: Number(r.lat),
        lng: Number(r.lng),
      },
    ]),
  );
  private locs = new Map<string, LatLng & { pin: string }>(
    readCsv('store_locations.csv').map((r) => [r.location_id, { pin: r.pin, lat: Number(r.lat), lng: Number(r.lng) }]),
  );

  constructor(private readonly db: DbService) {}

  async onModuleInit() {
    if (!this.db.configured) return;
    await this.db.query(`
      create table if not exists store_locations (
        location_id text primary key, pin text, lat double precision not null, lng double precision not null, source text not null
      )`);
    await this.db.query(`
      create table if not exists store_distances (
        a text not null, b text not null, distance_km int not null, travel_days int not null, primary key (a, b)
      )`);
    const [{ n }] = await this.db.query<{ n: number }>(`select count(*)::int as n from store_locations`);
    if (n === 0) {
      for (const [id, l] of this.locs) {
        await this.db.query(`insert into store_locations values ($1, $2, $3, $4, 'csv')`, [id, l.pin, l.lat, l.lng]);
      }
      this.log.log(`seeded ${this.locs.size} store locations`);
    }
    await this.reload();
    const [{ d }] = await this.db.query<{ d: number }>(`select count(*)::int as d from store_distances`);
    if (d !== this.locs.size * (this.locs.size - 1)) await this.recomputeDistances();
  }

  zoneOf(state: string): string | null {
    return ZONES[state] ?? null;
  }

  /** Ping place from the bundled PIN table (no paid geocoder): "Kanpur", or "18 km from Kanpur". */
  placeNear(point: LatLng): string | null {
    let best: { city: string; km: number } | null = null;
    for (const p of this.pins.values()) {
      const km = haversineKm(point, p);
      if (!best || km < best.km) best = { city: p.city, km };
    }
    if (!best || best.km > 150) return null;
    return best.km <= 10 ? best.city : `${Math.round(best.km)} km from ${best.city}`;
  }

  lookupPin(pin: string): PinInfo | null {
    return this.pins.get(pin) ?? null;
  }

  /** location_id → lat/lng for every store + WH-KOL (what the engine gets). */
  locations(): Record<string, LatLng> {
    return Object.fromEntries([...this.locs].map(([id, l]) => [id, { lat: l.lat, lng: l.lng }]));
  }

  nearest(point: LatLng, n: number, exclude?: string): NearestRow[] {
    return [...this.locs]
      .filter(([id]) => id !== exclude)
      .map(([id, l]) => {
        const km = roadKm(point, l);
        return { location_id: id, distance_km: km, travel_days: travelDays(km) };
      })
      .sort((a, b) => a.distance_km - b.distance_km || a.location_id.localeCompare(b.location_id))
      .slice(0, n);
  }

  /** Adds or moves a location and recomputes every pair (21 × 21 is tiny). */
  async addLocation(id: string, pin: string, point: LatLng, source: string) {
    if (this.db.configured) {
      await this.db.query(
        `insert into store_locations values ($1, $2, $3, $4, $5)
           on conflict (location_id) do update set pin = $2, lat = $3, lng = $4, source = $5`,
        [id, pin, point.lat, point.lng, source],
      );
    }
    this.locs.set(id, { pin, ...point });
    await this.recomputeDistances();
  }

  private async reload() {
    const rows = await this.db.query<{ location_id: string; pin: string; lat: number; lng: number }>(
      `select location_id, pin, lat, lng from store_locations`,
    );
    this.locs = new Map(rows.map((r) => [r.location_id, { pin: r.pin, lat: r.lat, lng: r.lng }]));
  }

  private async recomputeDistances() {
    if (!this.db.configured) return;
    const a: string[] = [], b: string[] = [], km: number[] = [], days: number[] = [];
    for (const [ia, la] of this.locs) {
      for (const [ib, lb] of this.locs) {
        if (ia === ib) continue;
        const d = roadKm(la, lb);
        a.push(ia); b.push(ib); km.push(d); days.push(travelDays(d));
      }
    }
    await this.db.query(`delete from store_distances`);
    await this.db.query(
      `insert into store_distances (a, b, distance_km, travel_days)
         select * from unnest($1::text[], $2::text[], $3::int[], $4::int[])`,
      [a, b, km, days],
    );
    this.log.log(`store_distances: ${a.length} pairs`);
  }
}
