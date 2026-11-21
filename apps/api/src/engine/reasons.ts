// One-line reasons from templates with real numbers (docs/02-engine.md §5). Never LLM text.
import { shortDate } from './dates';

export const rate = (v: number) => (v >= 1 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(1) : v.toFixed(2));
export const days = (d: number | null) => (d == null ? 'no sales' : `${Math.round(d)} day${Math.round(d) === 1 ? '' : 's'}`);

export function whLowCover(p: { v: number; available: number; coverBefore: number | null; qty: number; coverAfter: number | null; arrives: string }) {
  return `Sells ${rate(p.v)}/day, ${p.available} left = ${days(p.coverBefore)} cover; +${p.qty} from WH takes it to ${days(p.coverAfter)} (arrives ${shortDate(p.arrives)}).`;
}

export function stockout(p: { outDays: number; v: number; qty: number; from: string; arrives: string }) {
  return `Out of stock ${p.outDays} of last 84 days but sells ${rate(p.v)}/day when available; restock ${p.qty} from ${p.from} by ${shortDate(p.arrives)}.`;
}

export function minDisplay(p: { category: string; now: number; min: number; qty: number; v: number; arrives: string }) {
  return `${p.category} at ${p.now} of ${p.min} minimum display; +${p.qty} of a best seller here (${rate(p.v)}/day), arrives ${shortDate(p.arrives)}.`;
}

export function storeToStore(p: {
  from: string; to: string; qty: number; fromCover: number | null; toCover: number | null; fromAfter: number | null; days: number;
  jumped: { store: string; cover: number | null } | null; closer: { store: string; days: number } | null; farther: { store: string; days: number } | null;
}) {
  const leaves = `leaves ${p.from} at ${days(p.fromAfter)}`;
  if (p.jumped) return `${p.to} is sold out, so it goes before closer ${p.jumped.store} (${days(p.jumped.cover)} left); moving ${p.qty} ${leaves}.`;
  if (p.closer) return `${p.closer.store} (${days(p.closer.days)} away) filled first; ${p.to} is ${days(p.days)}. Moving ${p.qty} ${leaves}.`;
  if (p.farther) return `${p.to} is ${days(p.days)} away, ${p.farther.store} ${p.farther.days}; moving ${p.qty} to ${p.to} ${leaves}.`;
  return `${p.from} holds ${days(p.fromCover)} cover, ${p.to} has ${days(p.toCover)} (${days(p.days)} away); moving ${p.qty} ${leaves}.`;
}

export function ageing(p: { from: string; age: number; sold: number; to: string; toV: number; qty: number; days: number }) {
  return `In ${p.from} for ${p.age} days, ${p.sold} sold in 12 wks; ${p.to} (${days(p.days)} away) sells ${rate(p.toV)}/day. Move ${p.qty}.`;
}

export function pullBackAgeing(p: { qty: number; age: number | null; v: number; sold: number }) {
  const who = p.sold > 0 ? `${p.sold} sold here in 12 wks and no store needs more` : 'None sold here in 12 wks, no store needs more';
  return `${who}; ${p.qty} pieces, ${p.age ?? '?'} days old, back to WH to free display space.`;
}

export function pullBackCapacity(p: { store: string; load: number; capacity: number; qty: number; v: number; age: number | null }) {
  return `${p.store} holds ${p.load} of ${p.capacity} capacity; pull back ${p.qty} slow pieces (${rate(p.v)}/day, ${p.age ?? '?'} days old).`;
}
