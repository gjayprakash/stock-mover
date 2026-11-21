import type { NearestLocation } from '@sm/contract';
import { Chip } from '../../components/Chip';
import { num } from '../../lib/format';
import { KM_PER_DAY, PACKING_DAYS, WAREHOUSE_ID } from '../../../../api/src/engine/params';

const dayWord = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** The rule from apps/api/src/geo/distance.ts, in plain words. */
export const TRAVEL_RULE = `Travel time = ${dayWord(PACKING_DAYS)} to pack, then a day for every ${num(KM_PER_DAY)} km by road`;

/** Rows as the API sends them (closest first): 5 closest stores + the warehouse + the farthest store. */
export function NearestList({ rows }: { rows: NearestLocation[] }) {
  const longest = Math.max(1, ...rows.map((r) => r.distance_km));
  const stores = rows.filter((r) => r.location_id !== WAREHOUSE_ID);
  const closest = stores[0]?.location_id;
  const farthest = stores.length > 5 ? stores[stores.length - 1].location_id : undefined;
  return (
    <ul className="m-0 list-none p-0">
      {rows.map((r) => {
        const wh = r.location_id === WAREHOUSE_ID;
        const far = r.location_id === farthest;
        return (
          <li key={r.location_id} className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line px-5 py-4 md:px-8">
            <div className="min-w-0 flex-[1_1_200px]">
              <div className="text-[17px] font-semibold">{wh ? `Warehouse, ${r.city}` : r.city}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">
                {r.location_id}
                {r.location_id === closest && <Chip tone="ok" className="!py-0.5 !text-xs">Closest store</Chip>}
                {far && <Chip tone="neutral" className="!py-0.5 !text-xs">Farthest store</Chip>}
              </div>
            </div>
            <div className="flex min-w-0 flex-[2_1_240px] items-center gap-3">
              <div className="h-2.5 flex-1 rounded-full bg-line" aria-hidden="true">
                <div
                  className={`h-2.5 rounded-full ${far ? 'bg-burnt' : 'bg-ok'}`}
                  style={{ width: `${Math.max(2, (r.distance_km / longest) * 100)}%` }}
                />
              </div>
              <div className="w-24 shrink-0 text-right font-semibold">{num(r.distance_km)} km</div>
            </div>
            <div className="w-28 shrink-0">
              <span className={`font-bold ${far ? 'text-burnt' : 'text-ok'}`}>{dayWord(r.travel_days)}</span> away
            </div>
          </li>
        );
      })}
    </ul>
  );
}
