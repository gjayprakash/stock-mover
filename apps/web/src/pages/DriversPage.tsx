import { useCallback, useEffect, useRef, useState } from 'react';
import { createDriver, listDrivers, newPairLink, revokeDriver, type Driver, type PairLink } from '../features/drivers/api';
import { ConnectCard } from '../features/drivers/ConnectCard';
import { DriverCard } from '../features/drivers/DriverCard';

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');

/** /drivers (#84): connect a driver's phone with a WhatsApp link, see drivers, turn a phone off. API: #81. */
export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [pair, setPair] = useState<PairLink | null>(null);
  const [done, setDone] = useState<Driver | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    listDrivers().then((d) => { setDrivers(d); setListError(null); }, (e) => setListError(errText(e)));
  }, []);
  useEffect(refresh, [refresh]);

  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await job();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const showLink = (p: PairLink) => {
    setPair(p);
    setDone(null);
    refresh();
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const onCreate = (name: string, mobile: string) => run(async () => showLink(await createDriver(name, mobile)));
  const onNewLink = (id: string) => run(async () => showLink(await newPairLink(id)));

  const onPaired = useCallback((d: Driver) => {
    setDone(d);
    setPair(null);
    refresh();
  }, [refresh]);

  const onRestart = () => { setPair(null); setDone(null); setError(null); };

  const onRevoke = (d: Driver, what: 'cancel' | 'off') => {
    const ask = what === 'off'
      ? `Turn off ${d.name}'s phone? It is signed out on its next tap. Shipments with ${d.name} stay and can go to another driver.`
      : `Cancel the link sent to ${d.name}? It stops working at once.`;
    if (!window.confirm(ask)) return;
    run(async () => {
      await revokeDriver(d.id);
      if (pair?.driver.id === d.id) setPair(null);
      refresh();
    });
  };

  return (
    <div ref={topRef} className="flex scroll-mt-6 flex-col gap-10">
      <div>
        <h1 className="m-0 font-heading text-3xl font-normal text-ink md:text-[42px]">Drivers</h1>
        <p className="mt-2 max-w-3xl text-lg text-muted">
          Connect a driver's phone with one WhatsApp link. A connected phone shows only the shipments you give that driver, and lets them send where they are.
        </p>
      </div>

      <ConnectCard pair={pair} done={done} busy={busy} error={error} onCreate={onCreate} onNewLink={onNewLink} onPaired={onPaired} onRestart={onRestart} />

      <section className="flex flex-col gap-4">
        <h2 className="m-0 font-heading text-[28px] font-normal">Your drivers</h2>
        {listError ? (
          <p role="alert" className="m-0 font-semibold text-danger">{listError}</p>
        ) : !drivers ? (
          <div className="grid gap-5 md:grid-cols-2" aria-label="Loading drivers">
            {[0, 1].map((i) => <div key={i} className="h-48 animate-pulse rounded-[18px] bg-tint" />)}
          </div>
        ) : drivers.length === 0 ? (
          <p className="m-0 text-muted">No drivers yet. Connect the first phone above.</p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {drivers.map((d) => <DriverCard key={d.id} driver={d} busy={busy} onNewLink={onNewLink} onRevoke={onRevoke} />)}
          </div>
        )}
      </section>
    </div>
  );
}
