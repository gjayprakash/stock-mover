import type { StoreSummary } from '@sm/contract';
import { dateLong, num, storeLabel } from '../../lib/format';
import type { StockRowError } from './types';

/** Amber note: rows received on or before the stock count date are probably counted already. Warns, never blocks. */
export function EarlyNote({ rows, asOf }: { rows?: number[]; asOf: string }) {
  const shown = rows?.slice(0, 20) ?? [];
  const more = (rows?.length ?? 0) - shown.length;
  return (
    <div className="rounded-xl border border-warn/30 bg-warn-bg px-4 py-3 text-[15px] leading-snug text-[#6B4100]" role="status">
      {rows && (
        <span className="font-semibold">
          {rows.length === 1 ? 'Row' : 'Rows'} {shown.join(', ')}{more > 0 ? ` and ${num(more)} more` : ''}:{' '}
        </span>
      )}
      Received on or before {dateLong(asOf)}: this stock is probably already in the count. Add it only if you are sure it was not counted.
    </div>
  );
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
