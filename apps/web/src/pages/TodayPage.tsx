import { Link } from 'react-router-dom';
import type { MovesFile } from '@sm/contract';
import { Banner } from '../components/Banner';
import { ChecksPanel } from '../components/ChecksPanel';
import { EmptyState } from '../components/EmptyState';
import { Section } from '../components/Section';
import { Skeleton } from '../components/Skeleton';
import { useMovesFile } from '../data/useMovesFile';
import { useRuns } from '../data/useRuns';
import { dateShort, num, timeShort } from '../lib/format';
import { AskBox } from '../features/today/AskBox';
import { Hero } from '../features/today/Hero';
import { ProblemCard } from '../features/today/ProblemCard';
import { StoreTiles } from '../features/today/StoreTiles';

/** Daily run is expected every 24 h; older than this and the list is stale. */
const STALE_MS = 30 * 60 * 60 * 1000;

function RunBanners({ file, isSample }: { file: MovesFile; isSample: boolean }) {
  const { runs } = useRuns();
  const latest = runs[0];
  if (latest?.status === 'FAILED') {
    return (
      <Banner tone="danger" title={`This morning's run failed at ${timeShort(latest.started_at)}.`}>
        Showing yesterday's list. <Link to="/run">See the daily run</Link>
      </Banner>
    );
  }
  const age = Date.now() - new Date(file.run.generated_at).getTime();
  if (!isSample && age > STALE_MS) {
    return (
      <Banner tone="warn" title="This list is not from today.">
        It was made on {dateShort(file.run.generated_at)} at {timeShort(file.run.generated_at)}. The next run is due{' '}
        {dateShort(file.run.next_run_at)}, {timeShort(file.run.next_run_at)}.
      </Banner>
    );
  }
  return null;
}

function Loading() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading today's list">
      <Skeleton className="h-48 w-full rounded-[20px]" />
      <Skeleton className="h-72 w-full rounded-2xl" />
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

export default function TodayPage() {
  const { data, isSample } = useMovesFile();
  if (!data) return <Loading />;

  const [first, ...rest] = [...data.problems].sort((a, b) => a.rank - b.rank);

  return (
    <div className="flex flex-col gap-10 md:gap-14">
      <RunBanners file={data} isSample={isSample} />
      <Hero file={data} />

      <Section n={1} title="Today's problems and their fixes" explainer="Most urgent first. Read what we saw, then approve or skip.">
        {first ? (
          <>
            <ProblemCard problem={first} moves={data.moves} large />
            {rest.length > 0 && (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {rest.map((p) => <ProblemCard key={p.id} problem={p} moves={data.moves} />)}
              </div>
            )}
          </>
        ) : (
          <EmptyState
            title="No stock problems today"
            body={`Today's list still has ${num(data.summary.moves)} routine ${data.summary.moves === 1 ? 'move' : 'moves'}.`}
            action={<Link to="/moves" className="font-semibold">See all moves</Link>}
          />
        )}
      </Section>

      <Section
        n={2}
        title={`Your ${num(data.stores.length)} stores at a glance`}
        explainer="The bar shows how full each store is. Tap a store to see what goes in and out today."
      >
        <StoreTiles stores={data.stores} problems={data.problems} />
      </Section>

      <Section n={3} title="Not sure about something? Ask." explainer="Type a question in your own words. The answer uses today's real numbers.">
        <AskBox />
      </Section>

      <ChecksPanel blocked={data.blocked} violations={data.summary.violations} />
    </div>
  );
}
