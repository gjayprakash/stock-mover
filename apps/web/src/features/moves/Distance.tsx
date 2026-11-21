import { createContext, useContext } from 'react';
import { Link } from 'react-router-dom';
import type { Move, MovesFile } from '@sm/contract';
import { Chip } from './deps';

// #26 Nearest store first. All numbers come from the move (engine #25); older runs without the fields render nothing.

const nf = new Intl.NumberFormat('en-IN');
const dayWord = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
/** Same-city stores share one map point in the data, so 0 km reads as "Same city". */
export const kmDays = (km: number, d: number) =>
  `${Math.round(km) === 0 ? 'Same city' : `${nf.format(Math.round(km))} km`} · ${dayWord(d)}`;

const alts = (m: Move) => m.alternatives ?? [];
const hasDistance = (m: Move) => m.type === 'STORE_TO_STORE' && m.distance_km != null && m.travel_days != null;

/** Today's full move list, so a row can tell whether a closer store also gets this product today. */
export const AllMovesContext = createContext<Move[]>([]);

type Closer = { store_id: string; distance_km: number; travel_days: number; moves: Move[] };
/** Candidate stores nearer than this receiver, each with the moves that bring it this sku today (any source). */
function closerStores(m: Move, all: Move[]): Closer[] {
  return alts(m)
    .filter((a) => a.distance_km < (m.distance_km ?? 0))
    .map((a) => ({ ...a, moves: all.filter((x) => x.id !== m.id && x.sku_id === m.sku_id && x.to === a.store_id) }));
}
const names = (xs: { store_id: string }[]) => xs.map((x) => x.store_id).join(', ');
const storeWord = (n: number) => (n === 1 ? 'store' : 'stores');

/** Shown when the run has any store-to-store move with distances. */
export function ClosestBanner({ file }: { file: MovesFile }) {
  if (!file.moves.some(hasDistance)) return null;
  return (
    <div className="rounded-[14px] bg-ok-bg px-5 py-4 text-base leading-normal text-[#123D2E] md:px-6">
      <span className="font-bold">Closest store first.</span> When stock can go to more than one store, it goes to the nearest one
      first, unless a farther store has none left to sell. Arrival dates follow the planned lead times.
    </div>
  );
}

/** Under From → To in the row: "98 km · 2 days" and a chip that says only what the move list shows. */
export function RowDistance({ move: m }: { move: Move }) {
  const all = useContext(AllMovesContext);
  if (!hasDistance(m)) return null;
  const n = alts(m).length + 1;
  const closer = closerStores(m, all);
  const unserved = closer.filter((c) => !c.moves.length).length;
  return (
    <>
      <div className="mt-1.5 text-sm font-semibold whitespace-nowrap">{kmDays(m.distance_km!, m.travel_days!)}</div>
      {n > 1 && (
        <div className="mt-1.5">
          {closer.length === 0 ? (
            <Chip tone="ok" className="text-[13px] whitespace-normal! rounded-xl! leading-snug">Closest of {n}</Chip>
          ) : unserved === 0 ? (
            <Chip tone="ok" className="text-[13px] whitespace-normal! rounded-xl! leading-snug">After {closer.length} closer {storeWord(closer.length)}</Chip>
          ) : (
            <Chip tone="warn" className="text-[13px] whitespace-normal! rounded-xl! leading-snug">{unserved} closer {storeWord(unserved)} not served today</Chip>
          )}
        </div>
      )}
    </>
  );
}

const moveLinks = (ms: Move[]) =>
  ms.map((x, i) => (
    <span key={x.id}>
      {i > 0 && ', '}
      <Link to={`?move=${x.id}`} className="font-semibold text-cta underline" onClick={(e) => e.stopPropagation()}>{x.id}</Link>
    </span>
  ));

/** Expanded row: every candidate store, closest first, with the one that got the pieces marked and what the others get today. */
export function AlternativesList({ move: m }: { move: Move }) {
  const all = useContext(AllMovesContext);
  if (!hasDistance(m) || !alts(m).length) return null;
  const closer = closerStores(m, all);
  const served = closer.filter((c) => c.moves.length);
  const unserved = closer.filter((c) => !c.moves.length);
  const sameDonor = served.length > 0 && served.every((c) => c.moves.some((x) => x.from === m.from));
  const byStore = new Map(closer.map((c) => [c.store_id, c.moves]));
  const rows = [
    { store_id: m.to, distance_km: m.distance_km!, travel_days: m.travel_days!, chosen: true },
    ...alts(m).map((a) => ({ ...a, chosen: false })),
  ].sort((a, b) => a.distance_km - b.distance_km || a.travel_days - b.travel_days || Number(b.chosen) - Number(a.chosen));
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="m-0 font-semibold">Stores that also need {m.sku_id}, closest first</p>
      {served.length > 0 && (
        <p className="m-0 rounded-lg bg-ok-bg px-3 py-2 text-[#123D2E]">
          {served.length === 1 ? `${served[0].store_id} is closer and also gets` : `${names(served)} are closer and also get`} {m.sku_id} today (
          {moveLinks(served.flatMap((c) => c.moves))}).{' '}
          {sameDonor ? `${m.from} also sends ${m.qty} to ${m.to}.` : `${m.to} gets ${m.qty} from ${m.from}.`}
        </p>
      )}
      {unserved.length > 0 && (
        <p className="m-0 rounded-lg bg-warn-bg px-3 py-2 text-[#6B4100]">
          {unserved.length === 1 ? `${unserved[0].store_id} is` : `${names(unserved)} are`} closer but {unserved.length === 1 ? 'is' : 'are'} not
          getting {m.sku_id} today.
        </p>
      )}
      <ol className="m-0 flex list-none flex-col gap-1 p-0">
        {rows.map((r, i) => {
          const today = r.chosen ? [] : byStore.get(r.store_id) ?? all.filter((x) => x.sku_id === m.sku_id && x.to === r.store_id);
          return (
            <li key={r.store_id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 ${r.chosen ? 'bg-ok-bg' : 'bg-tint/50'}`}>
              <span className="w-5 text-muted">{i + 1}.</span>
              <span className="font-semibold">{r.store_id}</span>
              <span className="text-muted">
                {Math.round(r.distance_km) === 0
                  ? `Same city as ${m.from} · ${dayWord(r.travel_days)}`
                  : `${kmDays(r.distance_km, r.travel_days)} from ${m.from}`}
              </span>
              {r.chosen ? (
                <span className="font-semibold text-ok">gets these {m.qty}</span>
              ) : today.length ? (
                <span>gets it today: {moveLinks(today)}</span>
              ) : (
                <span className="text-muted">not in today's list</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
