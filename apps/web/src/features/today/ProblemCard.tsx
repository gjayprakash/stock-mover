import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Move, Problem } from '@sm/contract';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { WeeklyChart } from '../../components/WeeklyChart';
import { useApprovals } from '../../data/approvals';
import { movesById, problemStatus } from './problemStatus';

type Props = { problem: Problem; moves: Move[]; large?: boolean };

const linkBtn =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold no-underline';

function Block({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="text-[13px] font-bold tracking-[0.8px] text-muted uppercase">{label}</div>
      <p className="m-0 mt-1.5 text-[17px] leading-relaxed text-ink">{text}</p>
    </div>
  );
}

/** One problem: tag, title, What we saw, Our fix, Approve (orange) + Skip (outline). */
export function ProblemCard({ problem, moves, large }: Props) {
  const ap = useApprovals();
  const [undoIds, setUndoIds] = useState<string[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const byId = movesById(moves);
  const status = problemStatus(problem, byId, ap);
  const pending = problem.move_ids.filter((id) => byId.get(id)?.needs_signoff && ap.statusOf(id) !== 'approved');
  const href = `/problems/${encodeURIComponent(problem.id)}`;
  const entries = problem.move_ids.length;
  const noMoves = entries === 0;

  const approve = () => { ap.approveProblem(problem, moves); };
  const skip = () => {
    const fresh = problem.move_ids.filter((id) => ap.statusOf(id) === undefined);
    ap.skipProblem(problem.id);
    setUndoIds([problem.id, ...fresh]);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setUndoIds(null), 5000);
  };
  const undo = () => {
    if (undoIds) ap.undo(undoIds);
    setUndoIds(null);
  };

  const actions = (
    <div className="flex flex-wrap items-center gap-3">
      {status === 'approved' && pending.length > 0 && (
        <Link to={href} className={`${linkBtn} bg-cta text-white hover:bg-[#A8340A] hover:text-white`}>
          Review {pending.length} {pending.length === 1 ? 'entry' : 'entries'}
        </Link>
      )}
      {status === 'approved' && <Chip tone="ok">{noMoves ? 'Seen' : 'Approved'}</Chip>}
      {status === 'skipped' && (
        <>
          <Chip tone="neutral">Skipped</Chip>
          {undoIds && (
            <button type="button" onClick={undo} className="min-h-12 bg-transparent px-2 font-semibold text-cta underline">
              Undo
            </button>
          )}
        </>
      )}
      {!status && (
        <>
          {/* Nothing moves for a recount / data-check problem: record it as seen (decided), not "approved". */}
          <Button onClick={approve}>{noMoves ? 'Mark as seen' : 'Approve this fix'}</Button>
          <Button variant="outline" onClick={skip}>Skip</Button>
        </>
      )}
      <Link to={href} className="min-h-12 px-1 py-3 text-base font-semibold">
        {entries === 0 ? 'See details' : `See the ${entries} ${entries === 1 ? 'entry' : 'entries'}`}
      </Link>
    </div>
  );

  const body = (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <span className="self-start rounded-full bg-cta-bg px-3.5 py-1.5 text-sm font-bold text-[#8A2C07]">
        {large ? `Most urgent · ${problem.tag}` : problem.tag}
      </span>
      <h3 className={`m-0 font-heading font-normal text-ink ${large ? 'text-2xl md:text-[28px]' : 'text-xl md:text-[22px]'}`}>
        {/* Every title links to its problem page; the underline makes that visible without hovering. */}
        <Link to={href} className="text-ink underline decoration-line decoration-2 underline-offset-4 hover:text-cta hover:decoration-cta">
          {problem.title}
        </Link>
      </h3>
      <Block label="What we saw" text={problem.seen} />
      <Block label="Our fix" text={problem.fix} />
      {problem.needs_signoff_count > 0 && !status && (
        <p className="m-0 text-sm text-muted">
          {problem.needs_signoff_count} {problem.needs_signoff_count === 1 ? 'entry is' : 'entries are'} high value and
          {problem.needs_signoff_count === 1 ? ' needs' : ' need'} your sign-off one by one.
        </p>
      )}
      <div className="mt-auto pt-1">{actions}</div>
    </div>
  );

  const shadow = large ? 'shadow-[0_1px_2px_rgba(81,29,0,0.06),0_12px_32px_rgba(81,29,0,0.10)]' : 'shadow-card';
  return (
    <article className={`flex min-w-0 flex-col gap-8 rounded-2xl bg-white p-5 md:p-8 lg:flex-row ${shadow} ${status ? 'opacity-95' : ''}`}>
      {body}
      {large && problem.chart && problem.chart.weeks.length > 0 && (
        <div className="min-w-0 rounded-2xl bg-page p-4 lg:w-[42%]">
          <WeeklyChart label={problem.chart.label} weeks={problem.chart.weeks} series={problem.chart.series} height={240} />
        </div>
      )}
    </article>
  );
}
