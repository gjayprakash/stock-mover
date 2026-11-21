import type { MoveTrigger, MoveType, StoreSummary } from '@sm/contract';

const grouping = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** "Rs 1,31,200" (Indian grouping, whole rupees). */
export function inr(n: number): string {
  return `Rs ${grouping.format(Math.round(n))}`;
}

/** Hero tiles only: "Rs 3.4 L", "Rs 1.2 Cr". Falls back to inr() under 1 lakh. */
export function inrShort(n: number): string {
  const abs = Math.abs(n);
  const trim = (x: number) => x.toFixed(1).replace(/\.0$/, '');
  if (abs >= 1e7) return `Rs ${trim(n / 1e7)} Cr`;
  if (abs >= 1e5) return `Rs ${trim(n / 1e5)} L`;
  return inr(n);
}

/** Plain number with Indian grouping: "1,250". */
export function num(n: number): string {
  return grouping.format(n);
}

/** "1 piece", "1,250 pieces". */
export function pieces(n: number): string {
  return `${grouping.format(n)} ${Math.abs(n) === 1 ? 'piece' : 'pieces'}`;
}

/** Days of stock: "37 days", "1 day", null → "no sales". */
export function days(n: number | null): string {
  if (n === null || n === undefined) return 'no sales';
  const r = Math.round(n);
  return `${r} ${r === 1 ? 'day' : 'days'}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-04" (or a full ISO timestamp) → "Wed 4 Nov". Date-only strings are read as calendar dates, no TZ shift. */
export function dateShort(iso: string): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  // Date-only strings are calendar dates; timestamps are shown in IST.
  const d = new Date(dateOnly ? `${iso}T00:00:00Z` : new Date(iso).getTime() + 330 * 60_000);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "2026-10-31" → "31 Oct 2026". */
export function dateLong(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** ISO timestamp → "6:00 am" in IST. */
export function timeShort(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
    .toLowerCase();
}

/**
 * "Lucknow · LKO-03". Pass a StoreSummary, or a store_id plus the stores list to look up the city.
 * The warehouse reads "Warehouse · WH-KOL".
 */
export function storeLabel(
  store: Pick<StoreSummary, 'store_id' | 'city'> | string,
  stores?: Pick<StoreSummary, 'store_id' | 'city'>[],
): string {
  const id = typeof store === 'string' ? store : store.store_id;
  if (id === 'WH-KOL') return 'Warehouse · WH-KOL';
  const city = typeof store === 'string' ? stores?.find((s) => s.store_id === id)?.city : store.city;
  return city ? `${city} · ${id}` : id;
}

export const KIND_LABEL: Record<MoveType, string> = {
  WH_TO_STORE: 'Warehouse to store',
  STORE_TO_STORE: 'Store to store',
  PULL_BACK: 'Back to warehouse',
};
export function kindLabel(type: MoveType): string {
  return KIND_LABEL[type] ?? type;
}

export const TRIGGER_LABEL: Record<MoveTrigger, string> = {
  LOW_COVER: 'Low stock',
  STOCKOUT: 'Sold out',
  UNDER_STOCKED: 'Under-stocked store',
  MIN_DISPLAY: 'Below minimum display',
  AGEING: 'Ageing stock',
  OVER_CAPACITY: 'Store too full',
};

export const STATUS_LABEL: Record<StoreSummary['status'], string> = {
  TOO_FULL: 'Too full',
  RUNNING_EMPTY: 'Running empty',
  NORMAL: 'Normal',
};
