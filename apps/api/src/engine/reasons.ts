// One-line reasons from templates with real numbers (docs/02-engine.md §5). Never LLM text.
// Every number in a reason must match the move's own fields (velocity, cover_days, velocity_basis).
import { daysBetween, shortDate } from './dates';
import { AS_OF, MIN_NEED_VELOCITY, STOCKOUT_DAYS, WINDOW_DAYS, WINDOW_START } from './params';

type Basis = 'own' | 'blended' | 'peer';

/** Pieces a day. A rate that is above 0 but rounds to 0.00 shows as "under 0.01", never "0.00". */
export const rate = (v: number) => (v >= 1 ? v.toFixed(1) : v >= 0.01 ? v.toFixed(2) : v > 0 ? 'under 0.01' : '0');
export const days = (d: number | null) => (d == null ? 'no sales' : `${Math.round(d).toLocaleString('en-IN')} day${Math.round(d) === 1 ? '' : 's'}`);

/** "sells 1.2/day" from its own sales, or "similar stores sell 1.2/day" when the rate is not this store's own. */
const sells = (v: number, basis: Basis, own = 'sells') =>
  basis === 'peer' ? `similar stores sell ${rate(v)}/day` : basis === 'blended' ? `${own} about ${rate(v)}/day (own and similar stores)` : `${own} ${rate(v)}/day`;

/**
 * The days a store×SKU could have been on the shelf in the 84-day window: from the later of the window start,
 * the style's launch and the store's opening, to the as-of date.
 */
export function shelfWindow(launch: string, opened: string) {
  const start = [WINDOW_START, launch, opened].reduce((a, b) => (b > a ? b : a));
  const n = Math.max(0, Math.min(WINDOW_DAYS, daysBetween(start, AS_OF) + 1));
  const label = n >= WINDOW_DAYS ? `the last ${WINDOW_DAYS} days`
    : start === opened && opened >= launch ? `the ${n} days from the store's opening (${shortDate(opened)}) to ${shortDate(AS_OF)}`
    : `the ${n} days from launch (${shortDate(launch)}) to ${shortDate(AS_OF)}`;
  return { days: n, label };
}

/**
 * STOCKOUT vs LOW_COVER, on the shelf window: never in stock, or out more than STOCKOUT_DAYS / WINDOW_DAYS
 * (14 of 84) of the days it could have been on the shelf. Used by the move trigger and the reason line alike.
 */
export function wasStockout(instockDays: number, launch: string, opened: string) {
  const w = shelfWindow(launch, opened);
  const out = Math.max(0, w.days - Math.round(instockDays));
  return instockDays <= 0 || out * WINDOW_DAYS > STOCKOUT_DAYS * w.days;
}

export function whLowCover(p: { v: number; basis: Basis; available: number; coverBefore: number | null; qty: number; coverAfter: number | null; arrives: string }) {
  const s = sells(p.v, p.basis, 'Sells');
  return `${s[0].toUpperCase()}${s.slice(1)}, ${p.available} left = ${days(p.coverBefore)} cover; +${p.qty} from WH takes it to ${days(p.coverAfter)} (arrives ${shortDate(p.arrives)}).`;
}

export function stockout(p: {
  instockDays: number; launch: string; opened: string; v: number; basis: Basis; qty: number; from: string; arrives: string;
  available: number; coverBefore: number | null; coverAfter: number | null;
}) {
  const w = shelfWindow(p.launch, p.opened);
  const out = Math.max(0, w.days - Math.round(p.instockDays));
  // Barely out once the window starts at launch/opening: the low-cover line is the true story.
  if (!wasStockout(p.instockDays, p.launch, p.opened)) {
    return whLowCover({ v: p.v, basis: p.basis, available: p.available, coverBefore: p.coverBefore, qty: p.qty, coverAfter: p.coverAfter, arrives: p.arrives });
  }
  const restock = `restock ${p.qty} from ${p.from} by ${shortDate(p.arrives)}.`;
  if (p.instockDays <= 0) return `Not on the shelf on any of ${w.label}; ${sells(p.v, 'peer')}; ${restock}`;
  const when = p.basis === 'peer' ? `; ${sells(p.v, 'peer')}` : ` but ${sells(p.v, p.basis)} when on the shelf`;
  return `Out of stock ${out} of ${w.label}${when}; ${restock}`;
}

export function minDisplay(p: {
  category: string; now: number; min: number; qty: number; v: number; own: boolean; rank: number; of: number; whAge: number | null; arrives: string;
}) {
  const head = `${p.category} at ${p.now} of ${p.min} minimum display`;
  const tail = `arrives ${shortDate(p.arrives)}.`;
  const where = p.own ? 'here' : 'at similar stores';
  if (p.v < MIN_NEED_VELOCITY) {
    const age = p.whAge != null ? `, ${p.whAge} days in WH` : '';
    return `${head}; +${p.qty} to fill the display with slow WH stock (${rate(p.v)}/day ${where}${age}), ${tail}`;
  }
  const who = p.rank === 1 ? `the best seller ${where} among the ${p.of} ${p.category} SKUs in WH stock`
    : `no. ${p.rank} of ${p.of} ${p.category} SKUs in WH stock by sales ${where}`;
  return `${head}; +${p.qty} of ${who} (${rate(p.v)}/day), ${tail}`;
}

export function storeToStore(p: {
  from: string; to: string; qty: number; fromCover: number | null; toCover: number | null; fromAfter: number | null; days: number;
  km: number | null; jumped: { store: string; cover: number | null } | null; closer: { store: string; days: number } | null;
  farther: { store: string; days: number; km: number | null; cover: number | null } | null;
}) {
  const leaves = `leaves ${p.from} at ${days(p.fromAfter)} cover`;
  if (p.jumped) return `${p.to} is sold out, so it goes before closer ${p.jumped.store} (${days(p.jumped.cover)} left); moving ${p.qty} ${leaves}.`;
  if (p.closer) return `${p.closer.store} (${days(p.closer.days)} away) filled first; ${p.to} is ${days(p.days)} away. Moving ${p.qty} ${leaves}.`;
  if (p.farther) {
    const f = p.farther;
    const why = f.days > p.days ? `${f.store} is ${days(f.days)}`
      : (f.km ?? 0) > (p.km ?? 0) ? `${f.store} is also ${days(f.days)} but ${Math.round((f.km ?? 0) - (p.km ?? 0))} km farther`
      : `${f.store} is as close and has ${days(f.cover)} cover`;
    return `${p.to} is ${days(p.days)} away with ${days(p.toCover)} cover (${why}); moving ${p.qty} ${leaves}.`;
  }
  return `${p.from} holds ${days(p.fromCover)} cover, ${p.to} has ${days(p.toCover)} (${days(p.days)} away); moving ${p.qty} ${leaves}.`;
}

export function ageing(p: { from: string; age: number; sold: number; instock: number; to: string; toV: number; toBasis: Basis; qty: number; days: number }) {
  return `In ${p.from} for ${p.age} days, ${p.sold} sold in ${p.instock} days on the shelf; at ${p.to} (${days(p.days)} away) ${sells(p.toV, p.toBasis)}. Move ${p.qty}.`;
}

export function pullBackAgeing(p: { qty: number; age: number | null; v: number; basis: Basis; sold: number; instock: number; onHand: number; cover: number | null }) {
  const sold = `${p.sold > 0 ? p.sold : 'None'} sold here in ${p.instock} days on the shelf`;
  const cover = p.cover == null ? ''
    : p.sold === 0 ? `, so the ${rate(p.v)}/day rate is an estimate from other stores: ${p.onHand} on hand = ${days(p.cover)} cover`
    : `${p.basis === 'own' ? ` (${rate(p.v)}/day)` : ` (about ${rate(p.v)}/day with similar stores)`}: ${p.onHand} on hand = ${days(p.cover)} cover`;
  return `${sold}${cover}. No store needs more; ${p.qty} pieces, ${p.age ?? '?'} days old, back to WH to free display space.`;
}

export function pullBackCapacity(p: { store: string; load: number; capacity: number; qty: number; v: number; age: number | null }) {
  return `${p.store} holds ${p.load} of ${p.capacity} capacity; pull back ${p.qty} slow pieces (${rate(p.v)}/day, ${p.age ?? '?'} days old).`;
}
