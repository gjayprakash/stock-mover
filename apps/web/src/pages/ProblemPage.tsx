import { Link, useParams } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { useMovesFile } from '../data/useMovesFile';
import { inr, storeLabel } from '../lib/format';
import { ChecksAndQuestions } from '../features/problem/ChecksAndQuestions';
import { Evidence } from '../features/problem/Evidence';
import { FixCard } from '../features/problem/FixCard';
import { Destinations, Entries } from '../features/problem/Moves';

function BackLink() {
  return (
    <Link to="/" className="flex min-h-11 items-center gap-2 self-start font-semibold no-underline">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      Back to today's problems
    </Link>
  );
}

/** /problems/:id — prove one problem is real and approve its fix. */
export default function ProblemPage() {
  const { id = '' } = useParams();
  const { data } = useMovesFile();

  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-6 w-48" />
        <div className="flex flex-wrap gap-6">
          <Skeleton className="h-48 min-w-0 flex-[1_1_420px]" />
          <Skeleton className="h-48 min-w-0 flex-[1_1_300px]" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const problem = data.problems.find((p) => p.id === id);
  if (!problem) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <EmptyState
          title="This problem is not in today's list"
          body="It may have been fixed by today's run, or the link is old."
          action={<Link to="/" className="font-semibold">Back to Today</Link>}
        />
      </div>
    );
  }

  const byId = new Map(data.moves.map((m) => [m.id, m]));
  const moves = problem.move_ids.map((mid) => byId.get(mid)).filter((m): m is NonNullable<typeof m> => !!m);
  const units = moves.reduce((s, m) => s + m.qty, 0);
  const first = moves[0];
  const subject = [
    first?.style_name,
    problem.subject.style_id ?? problem.subject.sku_id,
    problem.subject.style_id && first ? inr(first.mrp) : null,
    problem.subject.store_id ? storeLabel(problem.subject.store_id, data.stores) : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-10 md:gap-12">
      <BackLink />
      <section className="-mt-4 flex flex-wrap gap-6 md:-mt-6">
        <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-3.5 rounded-[20px] bg-white p-6 shadow-card md:p-9">
          <span className="self-start rounded-full bg-cta-bg px-3.5 py-1.5 text-sm font-bold text-[#8A2C07]">
            Problem {problem.rank} of {data.problems.length} · {problem.tag}
          </span>
          <h1 className="m-0 font-heading text-3xl leading-tight font-normal md:text-[40px]">{problem.title}</h1>
          {subject.length > 0 && <p className="m-0 text-[17px] text-muted">{subject.join(' · ')}</p>}
        </div>
        <div className="min-w-0 flex-[1_1_320px]">
          <FixCard problem={problem} moves={moves} stores={data.stores} />
        </div>
      </section>

      <Evidence problem={problem} moves={moves} />
      {moves.length > 0 && <Destinations moves={moves} stores={data.stores} units={units} />}
      {moves.length > 0 && <Entries problemId={problem.id} moves={moves} stores={data.stores} />}
      <ChecksAndQuestions problem={problem} moves={moves} />
    </div>
  );
}
