import { useEffect, useMemo, useState } from 'react';
import { Banner } from '../components/Banner';
import { Skeleton } from '../components/Skeleton';
import { useMovesFile } from '../data/useMovesFile';
import { dateShort, timeShort } from '../lib/format';
import { loadSample, type FakeCtx } from '../features/add-stock/api';
import { SampleFile } from '../features/add-stock/SampleFile';
import { UploadAndCheck } from '../features/add-stock/UploadAndCheck';
import { TypeInForm } from '../features/add-stock/TypeInForm';
import { STOCK_COLUMNS } from '../features/add-stock/types';

/** Add stock (#24): sample file → upload → check → add. First screen that writes data. */
export default function AddStockPage() {
  const { data, loading } = useMovesFile();
  const ctx = useMemo<FakeCtx | null>(() => {
    if (!data) return null;
    // "Today" in the product = the day after the stock snapshot.
    const t = new Date(`${data.run.as_of}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + 1);
    return { stores: data.stores, moves: data.moves, today: t.toISOString().slice(0, 10) };
  }, [data]);
  const [sample, setSample] = useState<{ text: string | null; fake: boolean; unavailable: boolean }>({ text: null, fake: false, unavailable: false });

  useEffect(() => {
    if (!ctx) return;
    let alive = true;
    loadSample(ctx).then((s) => {
      if (!alive) return;
      setSample(s.kind === 'ok' ? { text: s.text, fake: s.fake, unavailable: false } : { text: null, fake: false, unavailable: true });
    });
    return () => { alive = false; };
  }, [ctx]);

  if (loading || !data || !ctx) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const nextRun = `${dateShort(data.run.next_run_at)}, ${timeShort(data.run.next_run_at)}`;

  return (
    <div className="flex flex-col gap-10 md:gap-12">
      <div>
        <h1 className="m-0 font-heading text-3xl font-normal text-ink md:text-[42px] md:leading-tight">Add new stock</h1>
        <p className="mt-2 max-w-[720px] text-lg leading-normal text-muted">
          New pieces arrived at the warehouse or a store? Add them with one file. They join the next daily run ({nextRun}), not today's list.
        </p>
      </div>
      {sample.fake && (
        <Banner tone="warn" title="Test mode.">The add stock service is not running, so this page uses a stand-in. Nothing is really saved.</Banner>
      )}
      {sample.unavailable ? (
        <Banner tone="warn" title="Adding stock is not available right now.">Nothing can be added at the moment. Please try again later.</Banner>
      ) : (
        <>
          <div id="sample-file" className="scroll-mt-6">
            <SampleFile text={sample.text} />
          </div>
          <UploadAndCheck ctx={ctx} nextRun={nextRun} />
          <TypeInForm ctx={ctx} nextRun={nextRun} />
          <section className="flex flex-col gap-5 rounded-2xl bg-ok-bg p-5 text-[#123D2E] md:px-10 md:py-9">
            <h2 className="m-0 font-heading text-2xl font-normal">What we check on every row</h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-8 gap-y-4 leading-snug">
              <div><div className="font-bold">Columns are in order</div>Same {STOCK_COLUMNS.length} names, same order as the sample file</div>
              <div><div className="font-bold">The store exists</div>If not, add the store first</div>
              <div><div className="font-bold">Pieces and dates make sense</div>A whole number above 0, a date that is not in the future</div>
              <div><div className="font-bold">The store has room</div>We warn you before a store goes over its space</div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
