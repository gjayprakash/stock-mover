import type { Move } from '@sm/contract';
import { useHistory } from './deps';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/** "Sold each week, last 12 weeks" at the store end of the move; weeks with an empty shelf are marked. */
export function WeeklySales({ move, storeName, openedOn }: { move: Move; storeName: string; openedOn?: string }) {
  const store = move.type === 'PULL_BACK' ? move.from : move.to;
  const key = `${store}|${move.sku_id}`;
  const { data, loading } = useHistory([key]);
  const weeks = (data?.[key] ?? []).slice(-12);

  if (loading) return <div className="h-[170px] animate-pulse rounded-xl bg-tint" />;
  if (!weeks.length) return <p className="m-0 text-[15px] text-muted">There is no weekly sales history for this product at {storeName}.</p>;

  // Leading weeks before the store opened, or before this product was first stocked or sold there, are "not on the
  // shelf yet": they are not counted or shaded as empty-shelf weeks.
  const firstLive = weeks.findIndex(
    (w) => (!openedOn || w.week_ending >= openedOn) && (w.days_in_stock > 0 || w.units_sold > 0 || w.closing_on_hand > 0),
  );
  const live = firstLive < 0 ? [] : weeks.slice(firstLive);
  const notYet = firstLive < 0 ? weeks.length : firstLive;
  const range = `${dayMonth(weeks[0].week_ending)} to ${dayMonth(weeks[weeks.length - 1].week_ending)}`;
  if (!live.length) {
    return <p className="m-0 text-[15px] leading-relaxed">This product was not on the shelf at {storeName} in the last {weeks.length} weeks ({range}).</p>;
  }
  const sold = live.reduce((s, w) => s + w.units_sold, 0);
  const emptyWeeks = live.filter((w) => w.days_in_stock < 7).length;
  const fullyEmpty = live.filter((w) => w.days_in_stock === 0).length;
  const since = notYet > 0 ? ` since ${dayMonth(live[0].week_ending)}` : ` in the last ${weeks.length} weeks (${range})`;
  const notYetNote = notYet > 0 ? ` Before that it was not on the shelf there yet.` : '';

  if (sold === 0) {
    return (
      <p className="m-0 text-[15px] leading-relaxed">
        No pieces sold at {storeName}{since}.{notYetNote}{' '}
        {fullyEmpty === live.length
          ? 'The shelf was empty the whole time, so it could not sell.'
          : fullyEmpty > 0
            ? `The shelf was empty for ${fullyEmpty} of those ${live.length} weeks.`
            : `It was on the shelf for all ${live.length} weeks.`}
      </p>
    );
  }

  const W = 400, H = 120, top = 16, pad = 2, bw = (W - pad * 2) / weeks.length;
  const max = Math.max(1, ...weeks.map((w) => w.units_sold));
  const y = (v: number) => top + (H - top) * (1 - v / max);

  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption className="text-[15px]">
        {sold} sold in {live.length} {live.length === 1 ? 'week' : 'weeks'} on sale
        {emptyWeeks > 0 && <> · shelf empty on some days in {emptyWeeks} of them</>}
        {notYet > 0 && <> · not on the shelf yet in the first {notYet}</>}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="h-auto w-full" role="img" aria-label={`Pieces sold each week at ${storeName}, ${range}`}>
        <defs>
          <pattern id="sm-not-yet" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="2" height="6" fill="#EFE2C8" />
          </pattern>
        </defs>
        <line x1={0} x2={W} y1={H} y2={H} stroke="#EFE2C8" />
        {weeks.map((w, i) => {
          const x = pad + i * bw;
          const empty = i >= notYet && w.days_in_stock < 7;
          return (
            <g key={w.week_ending}>
              {empty && <rect x={x} y={0} width={bw} height={H} fill="#FDE9DD" />}
              {i < notYet && <rect x={x} y={0} width={bw} height={H} fill="url(#sm-not-yet)" />}
              {w.units_sold > 0 && (
                <>
                  <rect x={x + bw * 0.18} y={y(w.units_sold)} width={bw * 0.64} height={H - y(w.units_sold)} rx={2} fill="#C7400E" />
                  <text x={x + bw / 2} y={y(w.units_sold) - 3} fontSize={11} textAnchor="middle" fill="#511D00">{w.units_sold}</text>
                </>
              )}
              <title>{i < notYet ? `Week ending ${dayMonth(w.week_ending)}: not on the shelf yet` : `Week ending ${dayMonth(w.week_ending)}: sold ${w.units_sold}, on the shelf ${w.days_in_stock} of 7 days`}</title>
            </g>
          );
        })}
        <text x={pad} y={H + 14} fontSize={11} fill="#5E4E42">{dayMonth(weeks[0].week_ending)}</text>
        <text x={W - pad} y={H + 14} fontSize={11} fill="#5E4E42" textAnchor="end">{dayMonth(weeks[weeks.length - 1].week_ending)}</text>
      </svg>
      <div className="flex flex-wrap gap-4 text-[13px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-cta" />Pieces sold that week</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#FDE9DD] ring-1 ring-[#F3D3BF]" />Shelf empty on some days</span>
        {notYet > 0 && <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[repeating-linear-gradient(45deg,#EFE2C8_0_2px,transparent_2px_4px)] ring-1 ring-line" />Not on the shelf yet</span>}
      </div>
    </figure>
  );
}
