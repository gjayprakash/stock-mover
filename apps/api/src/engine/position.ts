import { clean, key, displayCategory, type CleanData, type DataFlag } from './clean';
import { computeVelocity, type Basis, type Velocity } from './velocity';
import type { EngineData } from './data';
import { AS_OF, TARGET_COVER, DONOR_KEEP, WINDOW_DAYS, WAREHOUSE_ID } from './params';
import { daysBetween } from './dates';

export type Position = {
  store_id: string;
  sku_id: string;
  style_id: string;
  category: string; // display category (min_display grain)
  mrp: number;
  on_hand: number; // negatives treated as 0
  in_transit: number;
  in_transit_arrives_on: string | null;
  available: number; // on_hand + in_transit (rule 3)
  velocity: number;
  basis: Basis;
  units_12w: number;
  instock_days: number;
  cover_days: number | null; // null when velocity 0
  target_units: number;
  need: number;
  surplus: number;
  stock_age_days: number | null;
  lost_sales_12w: number;
  flagged: boolean;
  v: Velocity;
};

export type StorePosition = {
  store_id: string;
  store_units: number; // Σ on_hand
  store_in_transit: number;
  capacity: number;
  cat_units: Record<string, number>; // Σ on_hand per display category
  min_display: Record<string, number>;
};

export type Positions = {
  c: CleanData;
  rows: Map<string, Position>; // `${store}|${sku}`
  byStore: Map<string, StorePosition>;
  wh: Map<string, { on_hand: number; stock_age_days: number | null }>; // per SKU
  inbound: Map<string, { date: string; qty: number }[]>; // per SKU, sorted by date
  flags: DataFlag[];
};

export function buildPositions(data: EngineData): Positions {
  const c = clean(data);
  const snap = new Map<string, (typeof c.snapshot)[number]>();
  const wh: Positions['wh'] = new Map();
  for (const r of c.snapshot) {
    if (r.location_id === WAREHOUSE_ID) {
      wh.set(r.sku_id, { on_hand: Math.max(0, r.on_hand), stock_age_days: r.oldest_stock_received_on ? daysBetween(r.oldest_stock_received_on, AS_OF) : null });
    } else if (c.storeById.has(r.location_id)) snap.set(key(r.location_id, r.sku_id), r);
  }
  // Grain: every store×SKU in the snapshot or the weekly history.
  const pairs = new Set<string>(snap.keys());
  for (const w of c.weekly) if (c.storeById.has(w.store_id)) pairs.add(key(w.store_id, w.sku_id));

  const vel = computeVelocity(c, pairs);
  const rows = new Map<string, Position>();
  for (const k of pairs) {
    const [store_id, sku_id] = k.split('|');
    const it = c.items.get(sku_id)!;
    const s = snap.get(k);
    const v = vel.get(k)!;
    const on_hand = Math.max(0, s?.on_hand ?? 0);
    const in_transit = s?.in_transit ?? 0;
    const available = on_hand + in_transit;
    const target = Math.ceil(v.velocity * TARGET_COVER);
    rows.set(k, {
      store_id, sku_id, style_id: it.style_id, category: displayCategory(it.category), mrp: it.mrp,
      on_hand, in_transit, in_transit_arrives_on: s?.in_transit_arrives_on ?? null, available,
      velocity: v.velocity, basis: v.basis, units_12w: v.units_12w, instock_days: v.instock_days,
      cover_days: v.velocity > 0 ? available / v.velocity : null,
      target_units: target,
      need: Math.max(0, target - available),
      surplus: Math.max(0, on_hand - Math.ceil(v.velocity * DONOR_KEEP)),
      stock_age_days: on_hand > 0 && s?.oldest_stock_received_on ? daysBetween(s.oldest_stock_received_on, AS_OF) : null,
      lost_sales_12w: v.velocity * Math.max(0, WINDOW_DAYS - v.instock_days),
      flagged: c.flags.has(k),
      v,
    });
  }

  const byStore: Positions['byStore'] = new Map();
  for (const st of c.stores) {
    const min_display: Record<string, number> = {};
    for (const [mk, units] of c.minDisplay) {
      const [tier, cat] = mk.split('|');
      if (tier === st.tier) min_display[cat] = units;
    }
    byStore.set(st.store_id, { store_id: st.store_id, store_units: 0, store_in_transit: 0, capacity: st.stock_capacity_units, cat_units: {}, min_display });
  }
  for (const p of rows.values()) {
    const sp = byStore.get(p.store_id)!;
    sp.store_units += p.on_hand;
    sp.store_in_transit += p.in_transit;
    sp.cat_units[p.category] = (sp.cat_units[p.category] ?? 0) + p.on_hand;
  }

  const inbound: Positions['inbound'] = new Map();
  for (const r of c.raw.warehouse_inbound) {
    if (!c.items.has(r.sku_id)) continue;
    if (!inbound.has(r.sku_id)) inbound.set(r.sku_id, []);
    inbound.get(r.sku_id)!.push({ date: r.expected_date, qty: r.qty });
  }
  for (const list of inbound.values()) list.sort((a, b) => a.date.localeCompare(b.date));

  return { c, rows, byStore, wh, inbound, flags: [...c.flags.values()] };
}
