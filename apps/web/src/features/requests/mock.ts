/**
 * Demo answers for the Requests API while #79 is not deployed. Lives in memory for this page load only.
 * Distances = straight line × 1.3; days = the lead_times tab (same city 2, same zone 4, other zone 7;
 * WH-KOL → East 3, North 4, South 6). Stock numbers are made up per SKU, but stable between calls.
 */
import sample from '@sm/contract/moves.sample.json';
import type { Action, DeclineReason, SourceOption, SourcesReply, TransferRequest } from './api';
import { Refused } from './api';

type Loc = { id: string; name: string; zone: 'North' | 'East' | 'South'; lat: number; lng: number; flagship?: boolean };

const CITY: Record<string, { name: string; zone: Loc['zone']; lat: number; lng: number }> = {
  LKO: { name: 'Lucknow', zone: 'North', lat: 26.85, lng: 80.95 },
  KNP: { name: 'Kanpur', zone: 'North', lat: 26.45, lng: 80.33 },
  PAT: { name: 'Patna', zone: 'East', lat: 25.61, lng: 85.14 },
  MZF: { name: 'Muzaffarpur', zone: 'East', lat: 26.12, lng: 85.39 },
  BLR: { name: 'Bengaluru', zone: 'South', lat: 12.97, lng: 77.59 },
  MYS: { name: 'Mysuru', zone: 'South', lat: 12.3, lng: 76.64 },
};
const COUNT: Record<string, number> = { LKO: 4, KNP: 3, PAT: 4, MZF: 2, BLR: 5, MYS: 2 };
const FLAGSHIPS = new Set(['LKO-01', 'PAT-01', 'BLR-01', 'BLR-02']);

const STORES: Loc[] = Object.entries(COUNT).flatMap(([code, n]) =>
  Array.from({ length: n }, (_, i) => {
    const c = CITY[code];
    const id = `${code}-0${i + 1}`;
    return { id, name: c.name, zone: c.zone, lat: c.lat + i * 0.025, lng: c.lng - i * 0.03, flagship: FLAGSHIPS.has(id) };
  }),
);
const WH = { id: 'WH-KOL', name: 'Warehouse, Kolkata', lat: 22.57, lng: 88.36 };
const WH_DAYS: Record<Loc['zone'], number> = { East: 3, North: 4, South: 6 };

const find = (id: string) => STORES.find((s) => s.id === id) ?? STORES.find((s) => s.id === 'KNP-03')!;

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return Math.max(3, Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 1.3));
}
const days = (a: Loc, b: Loc) => (a.name === b.name ? 2 : a.zone === b.zone ? 4 : 7);

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

type SkuInfo = { style_name: string; size: string; mrp: number };
const CATALOG = new Map<string, SkuInfo>(
  (sample.moves as { sku_id: string; style_name: string; size: string; mrp: number }[]).map((m) => [
    m.sku_id,
    { style_name: m.style_name, size: m.size, mrp: m.mrp },
  ]),
);
function sku(id: string): SkuInfo {
  return CATALOG.get(id) ?? { style_name: id, size: id.split('-').pop() ?? '', mrp: 2999 + (hash(id) % 20) * 1000 };
}

export function sources(store: string, skuId: string): SourcesReply {
  const me = find(store);
  const rows: SourceOption[] = [];
  for (const s of STORES) {
    if (s.id === me.id) continue;
    const h = hash(`${skuId}|${s.id}`);
    const have = h % 19;
    if (have === 0) continue; // only places that hold the SKU are listed
    let can = Math.max(0, have - 3 - (h % 3));
    let blocked: SourceOption['blocked_reason'] = null;
    if (s.flagship && h % 2 === 0) blocked = 'flagship_top20';
    else if (can === 0) blocked = h % 3 === 0 ? 'under_display_min' : 'under_30_days';
    if (blocked) can = 0;
    rows.push({ location_id: s.id, name: s.flagship ? `${s.name} flagship` : s.name, km: km(me, s), days: days(me, s), can_spare: can, closest: false, blocked_reason: blocked });
  }
  rows.sort((a, b) => a.days - b.days || a.km - b.km || b.can_spare - a.can_spare);
  const top = rows.slice(0, 5);
  const first = top.find((r) => !r.blocked_reason);
  if (first) first.closest = true;
  top.push({ location_id: WH.id, name: WH.name, km: km(me, WH), days: WH_DAYS[me.zone], can_spare: 120 + (hash(skuId) % 240), closest: false, blocked_reason: null });
  const h = hash(`${skuId}|${me.id}|own`);
  return { sources: top, on_hand: h % 3, per_week: 1 + (h % 4) };
}

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

function make(id: string, from: string, to: string, skuId: string, qty: number, status: TransferRequest['status'], minutesAgo: number, reason: string | null = null): TransferRequest {
  const info = sku(skuId);
  const giver = find(from);
  const have = qty + 3 + (hash(id) % 6);
  const value = qty * info.mrp;
  return {
    id, sku_id: skuId, style_name: info.style_name, size: info.size, qty, from_location: from, to_location: to, status,
    value_mrp: value, needs_signoff: value > 100000, reason, created_at: ago(minutesAgo + 30), updated_at: ago(minutesAgo),
    giver_on_hand: have, giver_cover_days_after: 31 + (hash(id + skuId) % 60), // only asks that keep the giver at 30+ days are allowed
    days: from === WH.id ? WH_DAYS[find(to).zone] : days(giver, find(to)),
  };
}

/** One shared list, so a request made as one store shows up in the giver's box when you view as the giver. */
const db: TransferRequest[] = [];
const seeded = new Set<string>();
let seq = 100;
const nextId = () => `R-0${++seq}`;

/** Seeded once per store viewed: three asks from nearby stores and a short history of its own asks. */
function all(store: string) {
  const me = find(store);
  if (seeded.has(me.id)) return db;
  seeded.add(me.id);
  const near = STORES.filter((s) => s.id !== me.id).sort((a, b) => days(me, a) - days(me, b) || km(me, a) - km(me, b));
  const [a, b, c] = near;
  db.push(
    make(nextId(), me.id, a.id, 'KUR-05-L', 2, 'waiting', 25),
    make(nextId(), me.id, b.id, 'SHW-01-L', 5, 'waiting', 95),
    make(nextId(), me.id, c.id, 'JKT-04-M', 3, 'waiting', 300),
    make(nextId(), a.id, me.id, 'KUR-02-M', 2, 'on_the_way', 140),
    make(nextId(), c.id, me.id, 'IW-03-M', 1, 'approved', 230),
    make(nextId(), b.id, me.id, 'MOJ-02-9', 4, 'received', 60 * 50),
    make(nextId(), a.id, me.id, 'KUR-12-M', 3, 'declined', 60 * 75, 'need_it_here'),
  );
  return db;
}

export function list(store: string, box: 'incoming' | 'mine') {
  const me = find(store).id;
  return all(store)
    .filter((r) => (box === 'incoming' ? r.from_location === me : r.to_location === me))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map((r) => ({ ...r }));
}

export function create(store: string, body: { sku_id: string; qty: number; from_location: string }) {
  const src = sources(store, body.sku_id).sources.find((s) => s.location_id === body.from_location);
  if (!src || src.blocked_reason) throw new Refused(`${body.from_location} cannot give this product.`);
  if (body.qty < 1 || body.qty > src.can_spare) throw new Refused(`${body.from_location} can give at most ${src.can_spare}.`);
  const r = make(nextId(), body.from_location, find(store).id, body.sku_id, body.qty, 'waiting', 0);
  all(store).push(r);
  return { ...r };
}

const NEXT: Record<Action, { from: TransferRequest['status']; to: (r: TransferRequest) => TransferRequest['status'] }> = {
  approve: { from: 'waiting', to: (r) => (r.value_mrp > 100000 ? 'needs_signoff' : 'approved') },
  decline: { from: 'waiting', to: () => 'declined' },
  cancel: { from: 'waiting', to: () => 'cancelled' },
  signoff: { from: 'needs_signoff', to: () => 'approved' },
};

export function act(store: string, id: string, action: Action, reason?: DeclineReason) {
  const r = all(store).find((x) => x.id === id);
  if (!r) throw new Refused('That request is gone. Refresh the page.');
  const step = NEXT[action];
  if (r.status !== step.from) throw new Refused('Someone already answered this request.');
  r.status = step.to(r);
  r.reason = action === 'decline' ? reason ?? 'other' : r.reason;
  r.updated_at = new Date().toISOString();
  return { ...r };
}
