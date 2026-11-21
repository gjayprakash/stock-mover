import type { Move, MovesFile } from '@sm/contract';
import { Chip } from './deps';

// #26 Nearest store first. All numbers come from the move (engine #25); older runs without the fields render nothing.

const nf = new Intl.NumberFormat('en-IN');
const dayWord = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
export const kmDays = (km: number, d: number) => `${nf.format(Math.round(km))} km · ${dayWord(d)}`;

const alts = (m: Move) => m.alternatives ?? [];
const hasDistance = (m: Move) => m.type === 'STORE_TO_STORE' && m.distance_km != null && m.travel_days != null;

/** Shown when the run has any store-to-store move with distances. */
export function ClosestBanner({ file }: { file: MovesFile }) {
  if (!file.moves.some(hasDistance)) return null;
  return (
    <div className="rounded-[14px] bg-ok-bg px-6 py-4 text-base leading-normal text-[#123D2E]">
      <span className="font-bold">Closest store first.</span> When stock can go to more than one store, it goes to the nearest one
      first. Travel time = 1 day to pack + a day for every 350 km.
    </div>
  );
}

/** Under From → To in the row: "98 km · 2 days" and "Closest of N". */
export function RowDistance({ move: m }: { move: Move }) {
  if (!hasDistance(m)) return null;
  const n = alts(m).length + 1;
  return (
    <>
      <div className="mt-1.5 text-sm font-semibold">{kmDays(m.distance_km!, m.travel_days!)}</div>
      {n > 1 && <div className="mt-1.5"><Chip tone="ok" className="text-[13px]">Closest of {n}</Chip></div>}
    </>
  );
}

/** Expanded row: the receiver we chose plus the other candidates, closest first. */
export function AlternativesList({ move: m }: { move: Move }) {
  if (!hasDistance(m) || !alts(m).length) return null;
  const rows = [{ store_id: m.to, distance_km: m.distance_km!, travel_days: m.travel_days!, chosen: true }, ...alts(m).map((a) => ({ ...a, chosen: false }))];
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="m-0 font-semibold">Stores that also need {m.sku_id}, closest first</p>
      <ol className="m-0 flex list-none flex-col gap-1 p-0">
        {rows.map((r, i) => (
          <li key={r.store_id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 ${r.chosen ? 'bg-ok-bg' : 'bg-tint/50'}`}>
            <span className="w-5 text-muted">{i + 1}.</span>
            <span className="font-semibold">{r.store_id}</span>
            <span className="text-muted">{kmDays(r.distance_km, r.travel_days)} from {m.from}</span>
            {r.chosen && <span className="font-semibold text-ok">gets these {m.qty}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
