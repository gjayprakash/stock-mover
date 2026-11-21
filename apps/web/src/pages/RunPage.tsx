import { useEffect, useRef } from 'react';
import type { RunRow, RunStatus } from '@sm/contract';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Chip, type ChipTone } from '../components/Chip';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { useApprovals } from '../data/approvals';
import { useMovesFile } from '../data/useMovesFile';
import { useRuns } from '../data/useRuns';
import { downloadApprovedCsv } from '../lib/csv';
import { dateLong, num, timeShort } from '../lib/format';
import { STEPS, TRIGGER, failedStep, foundLabel, when } from '../features/run/labels';

const STATUS: Record<RunStatus, { label: string; tone: ChipTone }> = {
  FINISHED: { label: 'Finished', tone: 'ok' },
  FAILED: { label: 'Failed', tone: 'danger' },
  RUNNING: { label: 'Running', tone: 'warn' },
};

function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-warn border-t-transparent" aria-hidden="true" />;
}

export default function RunPage() {
  const { data, loading, reload: reloadMoves } = useMovesFile();
  const { runs, loading: runsLoading, isSample: runsDown, reload: reloadRuns } = useRuns();
  const { state, counts } = useApprovals();

  const latest: RunRow | undefined = runs[0];
  const running = latest?.status === 'RUNNING';

  // While a run is going, poll /api/runs every 5 s; when it finishes, refetch the moves file.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) reloadMoves();
    wasRunning.current = running;
    if (!running) return;
    const t = setInterval(reloadRuns, 5000);
    return () => clearInterval(t);
  }, [running, reloadRuns, reloadMoves]);

  if (loading || !data) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-12 w-2/3" />
        <div className="grid gap-6 md:grid-cols-2"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const { run, summary } = data;
  const neverRun = !runsLoading && !runsDown && runs.length === 0;
  // Last run: newest row from /api/runs; when the API is down, the run that produced the moves file.
  const last = latest
    ? { status: latest.status, at: latest.started_at, as_of: latest.as_of, violations: latest.violations, error: latest.error }
    : { status: run.status, at: run.generated_at, as_of: run.as_of, violations: summary.violations, error: undefined };
  const failed = last.status === 'FAILED';
  const badStep = failed ? failedStep(last.error) : -1;
  const found = Object.entries(summary.found);
  // next_run_at comes from the last good list; if a newer run already passed it (e.g. failed), roll on by whole days.
  let nextMs = new Date(run.next_run_at).getTime();
  const lastMs = new Date(last.at).getTime();
  while (latest && nextMs <= lastMs) nextMs += 86_400_000;
  const nextRun = new Date(nextMs).toISOString();

  return (
    <div className="flex flex-col gap-10 md:gap-12">
      <div>
        <h1 className="m-0 font-heading text-3xl font-normal text-ink md:text-[42px] md:leading-tight">It runs every morning on its own</h1>
        <p className="mt-2 max-w-2xl text-base text-muted md:text-lg">
          No buttons to press. The list is built at {timeShort(run.next_run_at)} every day and is ready when you sign in.
        </p>
      </div>

      {failed && (
        <Banner tone="danger" title="This morning's run failed.">
          Showing the last good list from {when(run.generated_at)} (stock as of {dateLong(run.as_of)}).
        </Banner>
      )}

      <section className="grid gap-6 md:grid-cols-2">
        {neverRun ? (
          <Card className="flex flex-col gap-2.5">
            <Chip tone="neutral" className="self-start">Not run yet</Chip>
            <div className="text-[15px] text-muted">Last run</div>
            <div className="font-heading text-2xl md:text-3xl">First run will start at {when(run.next_run_at)}</div>
          </Card>
        ) : (
          <Card className={`flex flex-col gap-2.5 ${failed ? 'ring-2 ring-danger/40' : ''}`}>
            <Chip tone={STATUS[last.status].tone} className="self-start">
              {last.status === 'RUNNING' && <Spinner />}
              {STATUS[last.status].label}
            </Chip>
            <div className="text-[15px] text-muted">Last run</div>
            <div className="font-heading text-2xl md:text-3xl">{when(last.at)}</div>
            {failed ? (
              <div className="text-base text-danger">{last.error ?? 'The run stopped with an error.'}</div>
            ) : last.status === 'RUNNING' ? (
              <div className="text-base text-muted">Building today's list now. This page updates by itself.</div>
            ) : (
              <div className="text-base text-muted">
                Stock as of close on {dateLong(last.as_of)} · {num(last.violations)} rules broken
              </div>
            )}
          </Card>
        )}
        <Card className="flex flex-col gap-2.5">
          <Chip tone="neutral" className="self-start">Scheduled</Chip>
          <div className="text-[15px] text-muted">Next run</div>
          <div className="font-heading text-2xl md:text-3xl">{when(nextRun)}</div>
          <div className="text-base text-muted">Runs by itself, every day</div>
        </Card>
      </section>

      {!neverRun && <section className="flex flex-col gap-5">
        <h2 className="m-0 font-heading text-2xl font-normal md:text-3xl">{failed ? 'What the last good run found' : "What this morning's run found"}</h2>
        {found.length === 0 ? (
          <EmptyState title="Nothing hidden found" body="The last run found no hidden stock problems." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 md:gap-5">
            {found.map(([key, n]) => (
              <Card key={key} padded={false} className="p-5 md:p-6">
                <div className="font-heading text-4xl leading-none">{num(n)}</div>
                <div className="mt-2 text-base leading-snug text-muted">{foundLabel(key, n)}</div>
              </Card>
            ))}
          </div>
        )}
      </section>}

      <section className="flex flex-col gap-5">
        <h2 className="m-0 font-heading text-2xl font-normal md:text-3xl">The steps, every morning</h2>
        <Card className="flex flex-col">
          {STEPS.map((s, i) => {
            const state = running ? 'wait' : failed ? (i < badStep ? 'ok' : i === badStep ? 'bad' : 'skip') : 'ok';
            const d = i === 4 && !failed && !running ? `${num(summary.violations)} broken in the last list` : s.d;
            return (
              <div key={s.t} className="flex items-start gap-4 border-b border-line py-3.5 last:border-b-0">
                <span
                  className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-white ${
                    state === 'ok' ? 'bg-ok' : state === 'bad' ? 'bg-danger' : 'bg-line'
                  }`}
                  aria-label={state === 'ok' ? 'done' : state === 'bad' ? 'failed' : 'not done'}
                >
                  {state === 'ok' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>}
                  {state === 'bad' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>}
                  {state === 'wait' && i === 0 && <Spinner />}
                </span>
                <div className="min-w-0">
                  <div className={`text-[17px] font-bold ${state === 'skip' ? 'text-muted' : ''}`}>{s.t}</div>
                  {state === 'bad' ? (
                    <div className="mt-0.5 text-[15px] text-danger">{last.error ?? 'Stopped here.'}</div>
                  ) : (
                    d && <div className="mt-0.5 text-[15px] text-muted">{d}</div>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="m-0 font-heading text-2xl font-normal md:text-3xl">Recent runs</h2>
        {runsLoading ? (
          <Skeleton className="h-32" />
        ) : runsDown ? (
          <>
            <Card padded={false} className="px-5 py-4">
              <RunLine at={run.generated_at} status={run.status} trigger={null} moves={summary.moves} violations={summary.violations} />
            </Card>
            <EmptyState title="Run history appears once the server is reachable" body="This is the run that made the list on screen now." />
          </>
        ) : runs.length === 0 ? (
          <EmptyState title="No runs yet" body={`The first run will start at ${when(run.next_run_at)}.`} />
        ) : (
          <Card padded={false} className="flex flex-col px-5">
            {runs.map((r) => (
              <div key={r.run_id} className="border-b border-line py-4 last:border-b-0">
                <RunLine at={r.started_at} status={r.status} trigger={r.trigger} moves={r.moves} violations={r.violations} error={r.error} />
              </div>
            ))}
          </Card>
        )}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-5 rounded-[20px] bg-brown p-6 text-page shadow-card md:p-9">
        <div>
          <div className="font-heading text-2xl md:text-[28px]">Today's approvals</div>
          <div className="mt-1.5 text-base text-tint">
            {num(counts.approved)} of {num(counts.total)} moves approved. Approved moves go to the warehouse and stores as a packing list.
          </div>
        </div>
        <Button disabled={counts.approved === 0} onClick={() => downloadApprovedCsv(data, state)}>
          Download approved list (CSV)
        </Button>
      </section>
    </div>
  );
}

function RunLine(props: {
  at: string; status: RunStatus; trigger: RunRow['trigger'] | null; moves: number; violations: number; error?: string;
}) {
  const s = STATUS[props.status];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <span className="min-w-40 font-semibold">{when(props.at)}</span>
      <Chip tone={s.tone}>{props.status === 'RUNNING' && <Spinner />}{s.label}</Chip>
      {props.trigger && <span className="text-sm text-muted">{TRIGGER[props.trigger]}</span>}
      {props.status === 'FINISHED' && (
        <span className="text-sm text-muted md:ml-auto">
          {num(props.moves)} moves · {num(props.violations)} rules broken
        </span>
      )}
      {props.error && <span className="w-full text-sm text-danger">{props.error}</span>}
    </div>
  );
}
