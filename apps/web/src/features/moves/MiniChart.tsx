import type { Move } from '@sm/contract';
import { useHistory } from './deps';

/** 12-week sales (bars) vs stock on hand (line) for the store end of a move; weeks with empty-shelf days shaded. */
export function MiniChart({ move }: { move: Move }) {
  const store = move.type === 'PULL_BACK' ? move.from : move.to;
  const key = `${store}|${move.sku_id}`;
  const { data, loading } = useHistory([key]);
  const weeks = (data?.[key] ?? []).slice(-12);

  if (loading) return <div className="h-[150px] animate-pulse rounded-xl bg-tint" />;
  if (!weeks.length) return <p className="text-sm text-[#5E4E42]">No weekly history for {store}.</p>;

  const W = 360, H = 120, pad = 4, bw = (W - pad * 2) / weeks.length;
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.units_sold, w.closing_on_hand)));
  const y = (v: number) => H - (v / max) * (H - 8);
  const line = weeks.map((w, i) => `${pad + i * bw + bw / 2},${y(w.closing_on_hand)}`).join(' ');
  const short = weeks.filter((w) => w.days_in_stock < 7).length;

  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption className="text-sm font-semibold">
        {store}, last {weeks.length} weeks
        {short > 0 && <span className="font-normal text-[#5E4E42]"> · shelf empty part of {short} {short === 1 ? 'week' : 'weeks'}</span>}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="h-auto w-full max-w-[420px]" role="img" aria-label={`Weekly sales and stock at ${store}`}>
        {weeks.map((w, i) => (
          <g key={w.week_ending}>
            {w.days_in_stock < 7 && <rect x={pad + i * bw} y={0} width={bw} height={H} fill="#FDE9DD" />}
            <rect x={pad + i * bw + bw * 0.2} y={y(w.units_sold)} width={bw * 0.6} height={H - y(w.units_sold)} rx={2} fill="#C7400E">
              <title>{`Week ending ${w.week_ending}: sold ${w.units_sold}, ${w.closing_on_hand} on the shelf, in stock ${w.days_in_stock} of 7 days`}</title>
            </rect>
          </g>
        ))}
        <polyline points={line} fill="none" stroke="#511D00" strokeWidth={2} />
        <text x={pad} y={H + 14} fontSize={11} fill="#5E4E42">{weeks[0].week_ending}</text>
        <text x={W - pad} y={H + 14} fontSize={11} fill="#5E4E42" textAnchor="end">{weeks[weeks.length - 1].week_ending}</text>
      </svg>
      <div className="flex flex-wrap gap-4 text-[13px] text-[#5E4E42]">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-cta" />Sold</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 bg-brown" />On the shelf</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#FDE9DD]" />Shelf empty some days</span>
      </div>
    </figure>
  );
}
