// How many pieces of one SKU a location can give away (#79). Pure: positions + open requests in, numbers out.
// Rules: 1 min display kept at the giver and receiver capacity never exceeded, 2 S++ never gives a top-20 style,
// 3 in-transit counts (open requests are already on their way), 4 giver keeps ≥ 30 days of cover for the SKU and the style.
import type { BlockedReason } from '@sm/contract';
import { displayCategory, key } from './clean';
import type { Positions } from './position';
import { MIN_DONOR_COVER, WAREHOUSE_ID } from './params';

/** An open request (waiting / needs sign-off / approved / on the way): its pieces have left the giver and are arriving at the receiver. */
export type Pending = { from: string; to: string; sku_id: string; qty: number };
export type Spare = { can_spare: number; blocked_reason: BlockedReason | null; on_hand: number };

const sumQty = (xs: Pending[], f: (p: Pending) => boolean) => xs.reduce((a, p) => a + (f(p) ? p.qty : 0), 0);

/** Free room at a receiving store: capacity − (units + in transit + open requests coming in − going out). */
export function receiverRoom(P: Positions, to: string, pending: Pending[]): number {
  const s = P.byStore.get(to);
  if (!s) return 0;
  const end = s.store_units + s.store_in_transit + sumQty(pending, (p) => p.to === to) - sumQty(pending, (p) => p.from === to);
  return Math.max(0, s.capacity - end);
}

/** Largest qty `from` can send `to` without breaking a rule. null = not a giver for this SKU (no stock, or a wrong count). */
export function canSpare(P: Positions, from: string, to: string, sku_id: string, pending: Pending[]): Spare | null {
  const { c } = P;
  const item = c.items.get(sku_id);
  if (!item || from === to) return null;
  const room = receiverRoom(P, to, pending);
  const out = (f: (p: Pending) => boolean) => sumQty(pending, (p) => p.from === from && f(p));

  if (from === WAREHOUSE_ID) {
    const on_hand = (P.wh.get(sku_id)?.on_hand ?? 0) - out((p) => p.sku_id === sku_id);
    if (on_hand <= 0) return null;
    return { can_spare: Math.min(on_hand, room), blocked_reason: null, on_hand };
  }

  const store = c.storeById.get(from);
  const row = P.rows.get(key(from, sku_id));
  if (!store || !row || row.flagged) return null;
  const on_hand = row.on_hand - out((p) => p.sku_id === sku_id);
  if (on_hand <= 0) return null;
  if (store.tier === 'S++' && c.protectedStyles.has(key(from, item.style_id))) return { can_spare: 0, blocked_reason: 'flagship_top20', on_hand };

  // Rule 4 · 30 days of cover, for the SKU (what the validator checks) and for the whole style (rules.csv wording).
  const keep = (available: number, velocity: number) => (velocity > 0 ? Math.floor(available - MIN_DONOR_COVER * velocity) : Infinity);
  const bySku = keep(row.available - out((p) => p.sku_id === sku_id), row.velocity);
  let styleAvail = 0, styleVel = 0;
  for (const r of P.rows.values()) {
    if (r.store_id !== from || r.style_id !== item.style_id) continue;
    styleAvail += r.available;
    styleVel += r.velocity;
  }
  styleAvail -= out((p) => c.items.get(p.sku_id)?.style_id === item.style_id);
  const cover = Math.min(bySku, keep(styleAvail, styleVel));

  // Rule 1 · the giver's display category stays at or above its minimum.
  const cat = displayCategory(item.category);
  const sp = P.byStore.get(from)!;
  const display = (sp.cat_units[cat] ?? 0) - out((p) => displayCategory(c.items.get(p.sku_id)?.category ?? '') === cat) - (sp.min_display[cat] ?? 0);

  const giverMax = Math.max(0, Math.min(on_hand, cover, display));
  const blocked_reason: BlockedReason | null = giverMax > 0 ? null : cover <= display ? 'under_30_days' : 'under_display_min';
  return { can_spare: Math.min(giverMax, room), blocked_reason, on_hand };
}
