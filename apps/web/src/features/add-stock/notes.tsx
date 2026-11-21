import type { StoreSummary } from '@sm/contract';
import { dateLong, num, storeLabel } from '../../lib/format';
import type { StockRowError } from './types';

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
