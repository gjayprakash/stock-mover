import type { Move, Problem, StoreSummary } from '@sm/contract';
import { Button } from '../../components/Button';
import { useApprovals } from '../../data/approvals';
import { inr, pieces, storeLabel } from '../../lib/format';
import { fixTotals } from './derive';
import { problemStatus } from './status';

/** Brown fix card: what we send, Approve all, then one-by-one sign-off for big moves. */
export function FixCard({ problem, moves, stores }: { problem: Problem; moves: Move[]; stores: StoreSummary[] }) {
  const api = useApprovals();
  const { approveProblem, approveMoves, statusOf, undo } = api;
  const t = fixTotals(moves);
  const status = problemStatus(problem, moves, api);
  const approved = status === 'approved';
  const pending = t.signoff.filter((m) => statusOf(m.id) !== 'approved');
  const normal = t.entries - t.signoff.length;
  const approvedCount = moves.filter((m) => statusOf(m.id) === 'approved').length;
  // What "Approve" will actually change: entries without sign-off that are not approved yet.
  const toApprove = moves.filter((m) => !m.needs_signoff && statusOf(m.id) !== 'approved').length;
  // Approving the last big entry by hand also marks the problem approved.
  const approveOne = (id: string) => {
    approveMoves([id]);
    if (!approved && pending.length === 1 && pending[0].id === id) approveProblem(problem, moves);
  };
  // Undo a skip: clear this problem's own status and only its moves that are still skipped.
  // Moves approved here or elsewhere (shared with another problem, All moves, Store) are never touched.
  const undoSkip = () => undo([problem.id, ...moves.filter((m) => statusOf(m.id) === 'skipped').map((m) => m.id)]);
  const keptApproved = status === 'skipped' ? moves.filter((m) => statusOf(m.id) === 'approved') : [];

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
        Send {pieces(t.units)} to {t.stores === 1 ? storeLabel(moves[0].to, stores) : `${t.stores} stores`}
      </div>
      <div className="text-[15px] leading-relaxed text-tint">
        {t.entries} {t.entries === 1 ? 'entry' : 'entries'} · {inr(t.value)} at tag price ·{' '}
        {t.signoff.length === 0
          ? 'none big enough to need an extra sign-off'
          : `${t.signoff.length} big ${t.signoff.length === 1 ? 'entry needs' : 'entries need'} a separate sign-off`}
      </div>

      {status === 'skipped' ? (
        <div className="flex flex-col gap-2 rounded-xl bg-tint px-4 py-3 text-brown">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-bold">
              {keptApproved.length === 0
                ? 'Skipped. Nothing from this problem will be sent.'
                : `Skipped. ${keptApproved.length} ${keptApproved.length === 1 ? 'entry stays' : 'entries stay'} approved from elsewhere.`}
            </span>
            <Button size="sm" variant="outline" onClick={undoSkip}>Undo</Button>
          </div>
          {keptApproved.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
              {keptApproved.map((m) => (
                <li key={m.id}>
                  <span className="font-semibold text-ok">Approved</span> · {pieces(m.qty)} {m.sku_id} to {storeLabel(m.to, stores)}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : !approved && normal === 0 ? null : !approved ? (
        <>
          <Button full onClick={() => approveProblem(problem, moves)}>
            {approvedCount > 0
              ? `Approve the remaining ${toApprove} ${toApprove === 1 ? 'entry' : 'entries'}`
              : normal === t.entries
                ? `Approve all ${t.entries} ${t.entries === 1 ? 'entry' : 'entries'}`
                : `Approve ${normal} of ${t.entries} entries`}
          </Button>
          {approvedCount > 0 && (
            <div className="text-[15px] text-tint">
              {approvedCount} {approvedCount === 1 ? 'entry is' : 'entries are'} already approved from elsewhere.
            </div>
          )}
        </>
      ) : (
        <div className="flex min-h-12 items-center justify-center rounded-xl bg-ok-bg px-4 text-center font-bold text-[#1D5B45]">
          {pending.length
            ? `Approved ${approvedCount} of ${t.entries}. ${pending.length} still ${pending.length === 1 ? 'needs' : 'need'} sign-off.`
            : `Approved all ${approvedCount} ${approvedCount === 1 ? 'entry' : 'entries'}.`}
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
                ) : status === 'skipped' ? (
                  <span className="text-sm font-bold text-muted">Skipped</span>
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
