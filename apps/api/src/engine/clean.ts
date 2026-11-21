import type { EngineData, Item, Store, SnapshotRow, WeeklyRow, BillLine } from './data';
import { WAREHOUSE_ID } from './params';
import { roadKm, travelDays, type LatLng } from '../geo/distance';

export const ACCESSORIES = 'Accessories (Safa/Mala/Stole)';
export const DISPLAY_CATEGORIES = ['Kurta Set', 'Sherwani', 'Indo-Western', 'Jacket', 'Mojari', ACCESSORIES] as const;

/** Category as used by min_display: Safa + Mala + Stole are one bucket. */
export function displayCategory(category: string): string {
  return category === 'Safa' || category === 'Mala' || category === 'Stole' ? ACCESSORIES : category;
}

export type LeadTimes = { whByZone: Record<string, number>; sameCity: number; sameZone: number; otherZone: number };

/** Read the route sentences in lead_times.csv. Fails if a route cannot be recognised. */
export function parseLeadTimes(rows: EngineData['lead_times']): LeadTimes {
  const lt: Partial<LeadTimes> & { whByZone: Record<string, number> } = { whByZone: {} };
  for (const { route, days } of rows) {
    const r = route.toLowerCase();
    if (r.startsWith('warehouse')) {
      const zone = ['East', 'North', 'South', 'West'].find((z) => r.includes(z.toLowerCase() + ' zone'));
      if (!zone) throw new Error(`engine: cannot read lead time route "${route}"`);
      lt.whByZone[zone] = days;
    } else if (r.includes('same city')) lt.sameCity = days;
    else if (r.includes('same zone')) lt.sameZone = days;
    else if (r.includes('different zone')) lt.otherZone = days;
    else throw new Error(`engine: cannot read lead time route "${route}"`);
  }
  if (lt.sameCity == null || lt.sameZone == null || lt.otherZone == null) throw new Error('engine: lead_times missing a store-to-store route');
  return lt as LeadTimes;
}

export type Locations = Record<string, LatLng>;

/** Road km and travel days between two stores, or null when either has no location (#20/#25). */
export function storeDistance(from: string, to: string, locations: Locations | null): { km: number; days: number } | null {
  const a = locations?.[from], b = locations?.[to];
  if (!a || !b) return null;
  const km = roadKm(a, b);
  return { km, days: travelDays(km) };
}

/**
 * Days for a move from → to (store_id or WH-KOL), always the lead_times tab (rule 5).
 * Warehouse lanes: by the store's zone. Store → store: same city / same zone other city / different zone,
 * from stores.city and stores.zone. Distance (storeDistance) only ranks receivers; it never sets the lead time.
 */
export function leadTime(from: string, to: string, stores: Map<string, Store>, lt: LeadTimes): number {
  const dest = stores.get(to);
  if (!dest) throw new Error(`engine: unknown destination ${to}`);
  if (from === WAREHOUSE_ID) {
    const d = lt.whByZone[dest.zone];
    if (d == null) throw new Error(`engine: no warehouse lead time for zone ${dest.zone}`);
    return d;
  }
  const src = stores.get(from);
  if (!src) throw new Error(`engine: unknown source ${from}`);
  if (src.city === dest.city) return lt.sameCity;
  if (src.zone === dest.zone) return lt.sameZone;
  return lt.otherZone;
}

export type DataFlag = { store_id: string; sku_id: string; on_hand: number; last_weekly_closing: number | null; note: string };

export type CleanData = {
  stores: Store[];
  storeById: Map<string, Store>;
  items: Map<string, Item>; // packaging removed
  /** non-packaging bill lines with date + store attached */
  sales: (BillLine & { bill_date: string; store_id: string })[];
  snapshot: SnapshotRow[]; // non-packaging
  weekly: WeeklyRow[]; // non-packaging
  weeks: string[]; // sorted week_ending values
  leadTimes: LeadTimes;
  minDisplay: Map<string, number>; // `${tier}|${category}`
  protectedStyles: Set<string>; // `${store_id}|${style_id}`
  flags: Map<string, DataFlag>; // `${store_id}|${sku_id}`
  raw: EngineData;
  locations: Locations | null; // lat/lng per store_id + WH-KOL (#20), null → route table
};

export const key = (a: string, b: string) => `${a}|${b}`;

export function clean(data: EngineData, locations: Locations | null = null): CleanData {
  const items = new Map(data.items.filter((i) => !i.is_packaging).map((i) => [i.sku_id, i]));
  const isItem = (sku: string) => items.has(sku);
  const storeById = new Map(data.stores.map((s) => [s.store_id, s]));
  const billById = new Map(data.bills.map((b) => [b.bill_id, b]));

  const sales: CleanData['sales'] = [];
  for (const l of data.bill_lines) {
    if (!isItem(l.sku_id)) continue;
    const b = billById.get(l.bill_id);
    if (!b) continue;
    sales.push({ ...l, bill_date: b.bill_date, store_id: b.store_id });
  }

  const snapshot = data.stock_snapshot.filter((r) => isItem(r.sku_id));
  const weekly = data.stock_weekly.filter((r) => isItem(r.sku_id));
  const weeks = [...new Set(weekly.map((w) => w.week_ending))].sort();
  const lastWeek = weeks[weeks.length - 1];

  // A8: wrong counts. Negative on_hand, or snapshot far from last weekly close.
  const lastClose = new Map<string, number>();
  for (const w of weekly) if (w.week_ending === lastWeek) lastClose.set(key(w.store_id, w.sku_id), w.closing_on_hand);
  const flags = new Map<string, DataFlag>();
  for (const r of snapshot) {
    if (r.location_id === WAREHOUSE_ID) continue;
    const k = key(r.location_id, r.sku_id);
    const close = lastClose.get(k) ?? null;
    let note: string | null = null;
    if (r.on_hand < 0) note = `Count shows ${r.on_hand} pieces, which cannot be right`;
    else if (close != null) {
      const gap = Math.abs(r.on_hand - close);
      if (gap > Math.max(10, 0.5 * Math.max(r.on_hand, close)))
        note = `Count shows ${r.on_hand} pieces but last week closed at ${close}`;
    }
    if (note) flags.set(k, { store_id: r.location_id, sku_id: r.sku_id, on_hand: r.on_hand, last_weekly_closing: close, note });
  }

  return {
    stores: data.stores,
    storeById,
    items,
    sales,
    snapshot,
    weekly,
    weeks,
    leadTimes: parseLeadTimes(data.lead_times),
    minDisplay: new Map(data.min_display.map((m) => [key(m.tier, m.category), m.min_display_units])),
    protectedStyles: new Set(data.flagship_protected.map((f) => key(f.store_id, f.style_id))),
    flags,
    raw: data,
    locations,
  };
}
