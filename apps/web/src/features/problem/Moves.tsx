import { Link } from 'react-router-dom';
import type { Move, StoreSummary } from '@sm/contract';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { ConfidenceDot } from '../../components/ConfidenceDot';
import { Section } from '../../components/Section';
import { useApprovals } from '../../data/approvals';
import { dateShort, days, num, pieces, storeLabel } from '../../lib/format';
import { byStore } from './derive';

const SHOWN = 6;

/** Section 2: one bar per destination store. */
export function Destinations({ moves, stores, units, storeLevel }: { moves: Move[]; stores: StoreSummary[]; units: number; storeLevel?: boolean }) {
  // A store-level problem has one destination, so show where the pieces come from instead.
  const rows = byStore(moves, storeLevel ? 'from' : 'to');
  const max = rows[0]?.qty || 1;
  return (
    <Section
      n={2}
      title={storeLevel ? `Where the ${pieces(units)} come from` : `Where the ${pieces(units)} go`}
      explainer={storeLevel ? 'Each giving store keeps enough for itself.' : 'Stores closest to empty are served first.'}
    >
      <Card className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-x-10 gap-y-3.5">
        {rows.map((r) => (
          <div key={r.store} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_4.5rem] items-center gap-3 text-[15px]">
            {r.store === 'WH-KOL' ? (
              <span className="truncate font-bold">{storeLabel(r.store, stores)}</span>
            ) : (
              <Link to={`/stores/${r.store}`} className="truncate font-bold text-ink no-underline hover:underline" title={storeLabel(r.store, stores)}>
                {storeLabel(r.store, stores)}
              </Link>
            )}
            <div className="h-3 rounded-md bg-tint">
              <div className="h-3 rounded-md bg-cta" style={{ width: `${(r.qty / max) * 100}%` }} />
            </div>
            <span className="text-right font-semibold">{num(r.qty)} pcs</span>
          </div>
        ))}
      </Card>
    </Section>
  );
}

function fromLabel(m: Move, stores: StoreSummary[]) {
  return m.from === 'WH-KOL' ? 'Warehouse' : storeLabel(m.from, stores);
}

/** Section 3: entry cards, most urgent first, first 6 then a link to All moves. */
export function Entries({ problemId, moves, stores }: { problemId: string; moves: Move[]; stores: StoreSummary[] }) {
  const { statusOf } = useApprovals();
  const sorted = [...moves].sort((a, b) => b.priority - a.priority);
  const rest = sorted.length - SHOWN;
  return (
    <Section n={3} title="Every entry, with its reason" explainer="Most urgent first. A green dot means the store's own sales history was used.">
      <div className="flex flex-col gap-4">
        {sorted.slice(0, SHOWN).map((m) => {
          const st = statusOf(m.id);
          return (
            <Card key={m.id} className="flex flex-wrap items-center gap-x-8 gap-y-4 !p-5 md:!px-7 md:!py-6">
              <div className="min-w-0 flex-[1_1_220px]">
                <div className="text-lg font-bold">
                  {fromLabel(m, stores)} to {storeLabel(m.to, stores)}
                </div>
                <div className="mt-0.5 text-[15px] text-muted">
                  {m.sku_id} · size {m.size} · <span className="whitespace-nowrap">arrives {dateShort(m.arrives_on)}</span>
                </div>
              </div>
              <div className="w-24 flex-none">
                <div className="text-[13px] text-muted">Send</div>
                <div className="text-[21px] font-bold">{num(m.qty)} pc</div>
              </div>
              <div className="min-w-0 flex-[1_1_200px] text-[15px]">
                <div><span className="font-bold text-[#8A2C07]">{days(m.to_before.cover_days)}</span> of stock today</div>
                <div><span className="font-bold text-[#1D5B45]">{days(m.to_after.cover_days)}</span> after delivery</div>
              </div>
              {st && <Chip tone={st === 'approved' ? 'ok' : 'neutral'}>{st === 'approved' ? 'Approved' : 'Skipped'}</Chip>}
              <div className="flex flex-[1_1_100%] items-start gap-2.5 rounded-xl bg-page px-4 py-3 text-base leading-normal text-[#2E221A]">
                <span className="mt-1"><ConfidenceDot basis={m.velocity_basis} /></span>
                <span>{m.reason}</span>
              </div>
            </Card>
          );
        })}
        {rest > 0 && (
          <Link to={`/moves?problem=${encodeURIComponent(problemId)}`} className="flex min-h-11 items-center self-center font-semibold">
            See the other {rest} {rest === 1 ? 'entry' : 'entries'}
          </Link>
        )}
        {rest <= 0 && (
          <Link to={`/moves?problem=${encodeURIComponent(problemId)}`} className="flex min-h-11 items-center self-center font-semibold">
            See these in All moves
          </Link>
        )}
      </div>
    </Section>
  );
}
