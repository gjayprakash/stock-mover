import { Link } from 'react-router-dom';
import type { Problem, StoreSummary } from '@sm/contract';
import { StatusChip } from '../../components/StatusChip';
import { num, pieces } from '../../lib/format';

const ORDER: Record<StoreSummary['status'], number> = { TOO_FULL: 0, RUNNING_EMPTY: 1, NORMAL: 2 };
const BAR: Record<StoreSummary['status'], string> = { TOO_FULL: 'bg-danger', RUNNING_EMPTY: 'bg-warn', NORMAL: 'bg-ok' };

/** Stores shown on a phone: Too full, Running empty, or with a NEW_STORE problem. */
export function storesToWatch(stores: StoreSummary[], problems: Problem[]): StoreSummary[] {
  const newStores = new Set(problems.filter((p) => p.kind === 'NEW_STORE').map((p) => p.subject.store_id));
  return stores.filter((s) => s.status !== 'NORMAL' || newStores.has(s.store_id));
}

/**
 * One tile per store: city, id, status chip, fill bar. Too full first, then Running empty, then by store_id.
 * Under 768 px only stores to watch show, then "See all N stores".
 */
export function StoreTiles({ stores, problems }: { stores: StoreSummary[]; problems: Problem[] }) {
  const sorted = [...stores].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.store_id.localeCompare(b.store_id));
  const watched = new Set(storesToWatch(stores, problems));
  const watch = (s: StoreSummary) => watched.has(s);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sorted.map((s) => {
          const fill = s.capacity > 0 ? s.stock_now / s.capacity : 0;
          return (
            <Link
              key={s.store_id}
              to={`/stores/${encodeURIComponent(s.store_id)}`}
              className={`${watch(s) ? 'flex' : 'hidden md:flex'} flex-col gap-3 rounded-2xl bg-white p-4 text-ink no-underline shadow-card hover:bg-tint hover:text-ink`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[17px] font-semibold">{s.city}</div>
                  <div className="text-sm whitespace-nowrap text-muted">{s.store_id}</div>
                </div>
                <StatusChip status={s.status} />
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-tint" role="img" aria-label={`${Math.round(fill * 100)}% full`}>
                <div className={`h-full rounded-full ${BAR[s.status]}`} style={{ width: `${Math.min(100, Math.round(fill * 100))}%` }} />
              </div>
              <div className="text-sm text-muted">
                {pieces(s.stock_now)}, room for {num(s.capacity)}
              </div>
            </Link>
          );
        })}
      </div>
      <Link to="/stores" className="min-h-12 self-start py-3 text-base font-semibold md:hidden">
        See all {num(stores.length)} stores
      </Link>
    </div>
  );
}
