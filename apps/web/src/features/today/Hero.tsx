import type { MovesFile } from '@sm/contract';
import { Button } from '../../components/Button';
import { useApprovals } from '../../data/approvals';
import { downloadApprovedCsv } from '../../lib/csv';
import { inr, num } from '../../lib/format';
import { useBrief } from './useBrief';

/** Brown hero: "We found N stock problems today." + brief + progress (x of N fixes approved). */
export function Hero({ file }: { file: MovesFile }) {
  const ap = useApprovals();
  const brief = useBrief(file.run.run_id);
  const total = file.problems.length;
  const approved = file.problems.filter((p) => ap.problemStatusOf(p.id) === 'approved').length;
  const decided = file.problems.filter((p) => ap.problemStatusOf(p.id)).length;
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
        {brief ? (
          <p className="m-0 max-w-2xl text-[17px] leading-relaxed whitespace-pre-line text-page/90">{brief.text}</p>
        ) : (
          total > 0 && (
            <p className="m-0 max-w-2xl text-[17px] leading-relaxed text-page/85">
              Each one is explained in plain words, with a fix ready to approve.
              {atRisk > 0 && ` About ${inr(atRisk)} of sales are at risk this week where good sellers ran out.`}
            </p>
          )
        )}
      </div>
      {total > 0 && (
        <div className="flex w-full shrink-0 flex-col gap-2 rounded-2xl bg-white/10 p-5 md:w-64">
          <div className="text-sm font-semibold text-page/80">Your progress</div>
          {allDone ? (
            <>
              <div className="font-heading text-[28px]">All fixes decided</div>
              <div className="text-sm text-page/80">
                {num(approved)} approved, {num(decided - approved)} skipped
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
