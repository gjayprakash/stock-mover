import { key, type CleanData, displayCategory } from './clean';
import { K, WINDOW_DAYS, WINDOW_START, AS_OF, BASIS_OWN_DAYS, BASIS_BLENDED_DAYS, NEW_STORE_DAYS, WAREHOUSE_ID } from './params';
import { daysBetween } from './dates';

export type Basis = 'own' | 'blended' | 'peer';
export type Velocity = {
  units_12w: number;
  instock_days: number;
  prior: number; // expected units per in-stock day here
  velocity: number; // units/day, blended
  basis: Basis;
  weekly_units: number[]; // per week in CleanData.weeks
  weekly_days: number[]; // days_in_stock per week
  weekly_closing: number[];
};

/**
 * Velocity per store×SKU per IN-STOCK day, blended with a peer prior (docs/02-engine.md §1):
 * velocity = (units_12w + K × prior) / (instock_days + K).
 */
export function computeVelocity(c: CleanData, pairs: Iterable<string>): Map<string, Velocity> {
  const weekIdx = new Map(c.weeks.map((w, i) => [w, i]));
  const nW = c.weeks.length;
  const weekOf = (date: string): number => {
    // week_ending is a Saturday; the week runs Sun..Sat
    for (let i = 0; i < nW; i++) if (date <= c.weeks[i]) return daysBetween(date, c.weeks[i]) < 7 ? i : -1;
    return -1;
  };

  const units = new Map<string, number[]>();
  const days = new Map<string, number[]>();
  const closing = new Map<string, number[]>();
  const arr = (m: Map<string, number[]>, k: string) => {
    let a = m.get(k);
    if (!a) m.set(k, (a = new Array(nW).fill(0)));
    return a;
  };

  // Store × display-category units in window (for the category index)
  const storeCat = new Map<string, number>();
  for (const s of c.sales) {
    if (s.bill_date < WINDOW_START || s.bill_date > AS_OF) continue;
    const wi = weekOf(s.bill_date);
    if (wi < 0) continue;
    arr(units, key(s.store_id, s.sku_id))[wi] += s.qty;
    const cat = displayCategory(c.items.get(s.sku_id)!.category);
    storeCat.set(key(s.store_id, cat), (storeCat.get(key(s.store_id, cat)) ?? 0) + s.qty);
  }
  for (const w of c.weekly) {
    const wi = weekIdx.get(w.week_ending)!;
    const k = key(w.store_id, w.sku_id);
    arr(days, k)[wi] = w.days_in_stock;
    arr(closing, k)[wi] = w.closing_on_hand;
  }

  // Network rate per SKU per in-stock day (and per style as fallback for SKUs never in stock)
  const sum = (a?: number[]) => (a ? a.reduce((x, y) => x + y, 0) : 0);
  const skuU = new Map<string, number>(), skuD = new Map<string, number>();
  const styleU = new Map<string, number>(), styleD = new Map<string, number>();
  const allKeys = new Set([...units.keys(), ...days.keys()]);
  for (const k of allKeys) {
    const sku = k.split('|')[1];
    const style = c.items.get(sku)!.style_id;
    const u = sum(units.get(k)), d = sum(days.get(k));
    skuU.set(sku, (skuU.get(sku) ?? 0) + u); skuD.set(sku, (skuD.get(sku) ?? 0) + d);
    styleU.set(style, (styleU.get(style) ?? 0) + u); styleD.set(style, (styleD.get(style) ?? 0) + d);
  }
  // Same shrinkage one level up, so a SKU with 1 sale in 1 network day does not read as 1/day:
  // sku rate ← style rate (per size in-stock day) ← category rate.
  const catU = new Map<string, number>(), catD = new Map<string, number>();
  for (const [style, u] of styleU) {
    const cat = [...c.items.values()].find((i) => i.style_id === style)!.category;
    catU.set(cat, (catU.get(cat) ?? 0) + u); catD.set(cat, (catD.get(cat) ?? 0) + (styleD.get(style) ?? 0));
  }
  const shrink = (u: number, d: number, prior: number) => (u + K * prior) / (d + K);
  // A SKU nobody stocked in 12 weeks, with nothing in the warehouse or due in, is not live: no prior.
  const live = new Set<string>([...skuD].filter(([, d]) => d > 0).map(([s]) => s));
  for (const r of c.snapshot) if (r.location_id === WAREHOUSE_ID && r.on_hand > 0) live.add(r.sku_id);
  for (const r of c.raw.warehouse_inbound) live.add(r.sku_id);
  const networkRate = (sku: string): number => {
    if (!live.has(sku)) return 0;
    const it = c.items.get(sku)!;
    const cd = catD.get(it.category) ?? 0;
    const catRate = cd > 0 ? (catU.get(it.category) ?? 0) / cd : 0;
    const styleRate = shrink(styleU.get(it.style_id) ?? 0, styleD.get(it.style_id) ?? 0, catRate);
    return shrink(skuU.get(sku) ?? 0, skuD.get(sku) ?? 0, styleRate);
  };

  // Category index: store's daily category sales (per day open in window) ÷ average store's.
  const openDays = new Map(c.stores.map((s) => [s.store_id, Math.max(1, Math.min(WINDOW_DAYS, daysBetween(s.opened_on > WINDOW_START ? s.opened_on : WINDOW_START, AS_OF) + 1))]));
  const catIndex = new Map<string, number>();
  const cats = new Set([...c.items.values()].map((i) => displayCategory(i.category)));
  for (const cat of cats) {
    const rates = c.stores.map((s) => (storeCat.get(key(s.store_id, cat)) ?? 0) / openDays.get(s.store_id)!);
    const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
    c.stores.forEach((s, i) => catIndex.set(key(s.store_id, cat), avg > 0 ? rates[i] / avg : 1));
    // A brand-new store has too few days for its own mix: use the average index of its tier peers.
    for (const s of c.stores) {
      if (daysBetween(s.opened_on, AS_OF) >= NEW_STORE_DAYS) continue;
      const peers = c.stores.filter((p) => p.tier === s.tier && daysBetween(p.opened_on, AS_OF) >= NEW_STORE_DAYS);
      if (peers.length) catIndex.set(key(s.store_id, cat), peers.reduce((a, p) => a + catIndex.get(key(p.store_id, cat))!, 0) / peers.length);
    }
  }

  const out = new Map<string, Velocity>();
  for (const k of pairs) {
    const [store, sku] = k.split('|');
    const it = c.items.get(sku)!;
    const wu = units.get(k) ?? new Array(nW).fill(0);
    const wd = days.get(k) ?? new Array(nW).fill(0);
    const u = sum(wu), d = sum(wd);
    const prior = networkRate(sku) * (catIndex.get(key(store, displayCategory(it.category))) ?? 1);
    const velocity = (u + K * prior) / (d + K);
    out.set(k, {
      units_12w: u, instock_days: d, prior, velocity,
      basis: d >= BASIS_OWN_DAYS ? 'own' : d >= BASIS_BLENDED_DAYS ? 'blended' : 'peer',
      weekly_units: wu, weekly_days: wd, weekly_closing: closing.get(k) ?? new Array(nW).fill(0),
    });
  }
  return out;
}
