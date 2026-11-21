import type { StoreSummary } from '@sm/contract';
import { dateLong, num, storeLabel } from '../../lib/format';
import type { StockRowError } from './types';

/** Dates (2026-11-01, 31 Oct 2026), product codes (KUR-99-M), store codes (LKO-01) and WH-KOL. */
const VALUE = /(\d{4}-\d{2}-\d{2}|\d{1,2} [A-Z][a-z]{2} \d{4}|\b[A-Z]{2,4}-\d{2}-[A-Z0-9]{1,4}\b|\b[A-Z]{2,4}-\d{2}\b|\bWH-KOL\b)/g;

/** Prints text with every code and date kept on one line, so "KUR-99-M" never breaks at a dash. */
export function NoBreak({ text }: { text: string }) {
  const parts = text.split(VALUE);
  return <>{parts.map((p, i) => (i % 2 ? <span key={i} className="whitespace-nowrap">{p}</span> : p))}</>;
}

/**
 * Same words as the server's received_on error (apps/api/src/stock/check.ts), shown in the form
 * before the check so the user can fix the date first. The server refuses such rows.
 */
export function oldDateText(asOf: string): string {
  return `Received on or before ${dateLong(asOf)}: already in the stock count. Use a date after it.`;
}

/**
 * Over-capacity line for one location, with the numbers from the API's row-0 warning
 * ("LKO-01 would hold 812 of 800 spaces"), the code swapped for "Lucknow · LKO-01".
 */
export function capacityText(locationId: string, warnings: StockRowError[], stores: StoreSummary[]): string {
  const label = storeLabel(locationId, stores);
  const w = warnings.find((x) => x.row === 0 && x.column === 'location_id' && x.message.startsWith(`${locationId} `));
  const rest = w?.message.slice(locationId.length + 1).replace(/\d{4,}/g, (d) => num(Number(d)));
  return rest ? `${label} ${rest}` : `${label} goes over its space`;
}
