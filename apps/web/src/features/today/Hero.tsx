import type { MovesFile } from '@sm/contract';
import { Button } from '../../components/Button';
import { useApprovals } from '../../data/approvals';
import { downloadApprovedCsv } from '../../lib/csv';
import { inr, num } from '../../lib/format';
import { movesById, problemStatus } from './problemStatus';
import { useBrief } from './useBrief';

/** Brown hero: "We found N stock problems today." + brief + progress (x of N fixes approved). */
export function Hero({ file }: { file: MovesFile }) {
  const ap = useApprovals();
  const brief = useBrief(file.run.run_id);
  const total = file.problems.length;
  const byId = movesById(file.moves);
  const statuses = file.problems.map((p) => problemStatus(p, byId, ap));
  const approved = statuses.filter((s) => s === 'approved').length;
  const decided = statuses.filter(Boolean).length;
  // "Mark as seen" (problem with no moves) is stored as approved; count it apart in the summary line.
  const seen = file.problems.filter((p, i) => statuses[i] === 'approved' && p.move_ids.length === 0).length;
  const summary = [
    [approved - seen, 'approved'],
    [seen, 'seen'],
    [decided - approved, 'skipped'],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, label]) => `${num(n as number)} ${label}`)
    .join(', ');
  const allDone = total > 0 && decided === total;
  const atRisk = file.stores.reduce((s, x) => s + (x.at_risk_week_inr || 0), 0);
  const pct = total ? Math.round((approved / total) * 100) : 0;

  return (
    <section className="flex flex-col gap-6 rounded-[20px] bg-brown p-6 text-page shadow-[0_12px_32px_rgba(81,29,0,0.25)] md:flex-row md:items-center md:justify-between md:gap-8 md:p-11">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <h1 className="m-0 font-heading text-[30px] leading-tight font-normal text-page md:text-[44px]">
          {total === 0
            ? 'No stock problems today.'
            : `We found ${num(total)} stock ${total === 1 ? 'problem' : 'problems'} today.`}
        </h1>
        {total > 0 && (
          <p className="m-0 max-w-2xl text-[17px] leading-relaxed text-page/85">
            Each one is explained in plain words, with a fix ready to approve.
          </p>
        )}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-heading text-[28px] leading-none text-[#F4A27C] md:text-[32px]">{inr(atRisk)}</span>
          <span className="text-[15px] text-page/85">of sales at risk this week in stores where good sellers ran out</span>
        </div>
        {brief && (
          <div className="max-w-2xl rounded-xl bg-white/10 px-4 py-3">
            <div className="text-[13px] font-bold tracking-[0.8px] text-page/70 uppercase">Morning brief</div>
            <p className="m-0 mt-1 text-[15px] leading-relaxed whitespace-pre-line text-page/95">{brief.text}</p>
          </div>
        )}
      </div>
      {total > 0 && (
        <div className="flex w-full shrink-0 flex-col gap-2 rounded-2xl bg-white/10 p-5 md:w-64">
          <div className="text-sm font-semibold text-page/80">Your progress</div>
          {allDone ? (
            <>
              <div className="font-heading text-[28px]">All fixes decided</div>
              <div className="text-sm text-page/80">
                {summary}
              </div>
              <Button className="mt-2" onClick={() => downloadApprovedCsv(file, ap.state)} disabled={ap.counts.approved === 0}>
                Download approved list (CSV)
              </Button>
            </>
          ) : (
            <>
              <div className="font-heading text-[36px] leading-none">
                {num(approved)} of {num(total)}
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-[#F4A27C]" style={{ width: `${pct}%` }} />
              </div>
              <div className="text-sm text-page/80">fixes approved</div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
