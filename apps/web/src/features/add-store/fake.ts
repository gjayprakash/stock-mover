/**
 * DEV ONLY. Loaded by ./api.ts through a dynamic import guarded by import.meta.env.DEV, so it is not in the
 * production bundle. Mirrors apps/api/src/stores + apps/api/src/geo using the same bundled CSVs, so the
 * screen can be checked on a laptop without DATABASE_URL. Added stores live in memory until reload.
 */
import type { NearestLocation, NewStoreRequest } from '@sm/contract';
import pinsCsv from '../../../../../data/geo/pincodes.csv?raw';
import locsCsv from '../../../../../data/geo/store_locations.csv?raw';
import storesCsv from '../../../../../data/csv/stores.csv?raw';
import { KM_PER_DAY, PACKING_DAYS, ROAD_FACTOR, WAREHOUSE_ID } from '../../../../api/src/engine/params';
import type { CreateReply, GeoReply } from './api';
import { toRequest, validate } from './validate';

type LatLng = { lat: number; lng: number };

function rows(csv: string): Record<string, string>[] {
  const [head, ...lines] = csv.trim().split(/\r?\n/);
  const cols = head.split(',');
  return lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v.trim()])));
}

const ZONES: Record<string, string> = { 'Uttar Pradesh': 'North', Bihar: 'East', Karnataka: 'South' };
const pins = new Map(rows(pinsCsv).map((r) => [r.pin, r]));
const locs = new Map<string, LatLng>(rows(locsCsv).map((r) => [r.location_id, { lat: Number(r.lat), lng: Number(r.lng) }]));
const cities = new Map<string, string>(rows(storesCsv).map((r) => [r.store_id, r.city]));
cities.set(WAREHOUSE_ID, 'Kolkata');

const rad = (d: number) => (d * Math.PI) / 180;
function roadKm(a: LatLng, b: LatLng) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * ROAD_FACTOR);
}

export function fakeNearest(p: LatLng, exclude?: string): NearestLocation[] {
  const all = [...locs]
    .filter(([id]) => id !== exclude)
    .map(([id, l]) => {
      const km = roadKm(p, l);
      return { location_id: id, city: cities.get(id) ?? id, distance_km: km, travel_days: PACKING_DAYS + Math.ceil(km / KM_PER_DAY) };
    })
    .sort((a, b) => a.distance_km - b.distance_km || a.location_id.localeCompare(b.location_id));
  const stores = all.filter((r) => r.location_id !== WAREHOUSE_ID);
  const pick = new Set([...stores.slice(0, 5), all.find((r) => r.location_id === WAREHOUSE_ID), stores[stores.length - 1]]);
  return all.filter((r) => pick.has(r));
}

export function fakeLookupPin(pin: string): GeoReply {
  const r = pins.get(pin.trim());
  if (!r) return { ok: false, notFound: true };
  const geo = {
    pin: r.pin, place: r.place, city: r.place.replace(/ (GPO|Head Office)$/, ''), state: r.state,
    zone: ZONES[r.state] ?? null, lat: Number(r.lat), lng: Number(r.lng),
  };
  return { ok: true, geo: { ...geo, nearest: fakeNearest(geo) } };
}

export function fakeNextCode(city: string): string | null {
  const prefix = city.replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase();
  if (prefix.length < 3) return null;
  const used = [...cities.keys()].filter((id) => id.startsWith(prefix + '-')).map((id) => Number(id.slice(4)));
  return `${prefix}-${String(Math.max(0, ...used) + 1).padStart(2, '0')}`;
}

export function fakeCreate(body: NewStoreRequest): CreateReply {
  const v = {
    ...body, capacity: String(body.capacity), lat: String(body.lat), lng: String(body.lng),
  };
  const errs = Object.entries(validate(v)).map(([field, message]) => ({ field, message: message as string }));
  if (!errs.length && cities.has(body.store_id)) errs.push({ field: 'store_id', message: 'This code is already used' });
  if (errs.length) return { ok: false, errors: errs };
  const req = toRequest(v);
  const r = pins.get(req.pin);
  const state = r?.state ?? '';
  const zone = (r && ZONES[r.state]) ?? '';
  cities.set(req.store_id, req.city);
  locs.set(req.store_id, { lat: req.lat, lng: req.lng });
  return {
    ok: true,
    created: { store: { ...req, state, zone, stock_capacity_units: req.capacity }, nearest: fakeNearest(req, req.store_id) },
  };
}
