import type { Move, Problem, StoreSummary } from '@sm/contract';
import { Button } from '../../components/Button';
import { useApprovals } from '../../data/approvals';
import { inr, pieces, storeLabel } from '../../lib/format';
import { fixTotals } from './derive';

/** Brown fix card: what we send, Approve all, then one-by-one sign-off for big moves. */
export function FixCard({ problem, moves, stores }: { problem: Problem; moves: Move[]; stores: StoreSummary[] }) {
  const { approveProblem, approveMoves, statusOf, problemStatusOf } = useApprovals();

  const t = fixTotals(moves);
  const approved = problemStatusOf(problem.id) === 'approved';
  const pending = t.signoff.filter((m) => statusOf(m.id) !== 'approved');
  const normal = t.entries - t.signoff.length;
  // Approving the last big entry by hand also marks the problem approved.
  const approveOne = (id: string) => {
    approveMoves([id]);
    if (!approved && pending.length === 1 && pending[0].id === id) approveProblem(problem, moves);
  };

  if (t.entries === 0) {
    return (
      <div className="flex flex-col gap-3 rounded-[20px] bg-brown p-6 text-page shadow-card md:p-8">
        <div className="text-[15px] text-tint">Our fix</div>
        <div className="font-heading text-[28px] leading-tight">Nothing moves. Count this item first.</div>
        <div className="text-[15px] leading-relaxed text-tint">{problem.fix}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5 rounded-[20px] bg-brown p-6 text-page shadow-card md:p-8">
      <div className="text-[15px] text-tint">Our fix</div>
      <div className="font-heading text-[28px] leading-tight md:text-[30px]">
        Send {pieces(t.units)} to {t.stores} {t.stores === 1 ? 'store' : 'stores'}
      </div>
      <div className="text-[15px] leading-relaxed text-tint">
        {t.entries} {t.entries === 1 ? 'entry' : 'entries'} · {inr(t.value)} at tag price ·{' '}
        {t.signoff.length === 0
          ? 'none big enough to need an extra sign-off'
          : `${t.signoff.length} big ${t.signoff.length === 1 ? 'entry needs' : 'entries need'} a separate sign-off`}
      </div>

      {!approved && normal === 0 ? null : !approved ? (
        <Button full onClick={() => approveProblem(problem, moves)}>
          {normal === t.entries ? `Approve all ${t.entries} ${t.entries === 1 ? 'entry' : 'entries'}` : `Approve ${normal} of ${t.entries} entries`}
        </Button>
      ) : (
        <div className="flex min-h-12 items-center justify-center rounded-xl bg-ok-bg px-4 text-center font-bold text-[#1D5B45]">
          {pending.length ? `Approved ${normal}. ${pending.length} still ${pending.length === 1 ? 'needs' : 'need'} sign-off.` : 'Approved.'}
        </div>
      )}

      {t.signoff.length > 0 && (
        <div className="mt-2 flex flex-col gap-2 rounded-xl bg-white/10 p-3">
          <div className="text-sm font-semibold text-tint">Big entries: review and approve one by one</div>
          {t.signoff.map((m) => {
            const done = statusOf(m.id) === 'approved';
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 text-ink">
                <div className="min-w-0 flex-1 text-sm leading-snug">
                  <span className="font-semibold">{pieces(m.qty)} {m.sku_id} to {storeLabel(m.to, stores)}</span>
                  <span className="block text-muted">{inr(m.value_inr)} · {m.reason}</span>
                </div>
                {done ? (
                  <span className="text-sm font-bold text-ok">Approved</span>
                ) : (
                  <Button size="sm" onClick={() => approveOne(m.id)}>Approve</Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
