import { useCallback, useEffect, useState } from 'react';
import { Banner } from '../components/Banner';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import {
  assignDriver,
  listDrivers,
  listShipments,
  receiveShipment,
  type Dir,
  type Driver,
  type ShipmentsReply,
} from '../features/shipments/api';
import { ShipmentCard } from '../features/shipments/ShipmentCard';
import { ShipmentsTable } from '../features/shipments/ShipmentsTable';
import { AdminStorePicker, useNeedsStore } from '../features/auth/AdminStorePicker';
import type { Shipment } from '../features/shipments/api';

const POLL_MS = 60_000;

/** Shipments (#83): coming in / going out, selected shipment card, list. Polls every 60 s while open. */
export default function ShipmentsPage() {
  const [dir, setDir] = useState<Dir>('in');
  const [data, setData] = useState<Record<Dir, ShipmentsReply | null>>({ in: null, out: null });
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [inn, out] = await Promise.all([listShipments('in'), listShipments('out')]);
      setData({ in: inn, out });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load shipments');
    }
  }, []);

  const needsStore = useNeedsStore();

  useEffect(() => {
    if (needsStore) return;
    load();
    listDrivers().then((r) => setDrivers(r.drivers)).catch(() => setDrivers([]));
    const t = setInterval(() => document.visibilityState === 'visible' && load(), POLL_MS);
    return () => clearInterval(t);
  }, [load, needsStore]);

  /** Show the server's answer at once, then reload the lists in the background. */
  const applyNow = (s: Shipment) =>
    setData((d) => ({
      in: d.in && { ...d.in, shipments: d.in.shipments.map((x) => (x.id === s.id ? { ...x, ...s } : x)) },
      out: d.out && { ...d.out, shipments: d.out.shipments.map((x) => (x.id === s.id ? { ...x, ...s } : x)) },
    }));

  const reply = data[dir];
  const rows = reply?.shipments ?? [];
  const current = rows.find((s) => s.id === selected) ?? rows.find((s) => s.status !== 'received') ?? rows[0] ?? null;
  const store = data.in?.store_id ?? data.out?.store_id;
  const sample = data.in?.sample || data.out?.sample;

  const tab = (d: Dir, label: string) => {
    const on = d === dir;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={on}
        onClick={() => {
          setDir(d);
          setSelected(null);
        }}
        className={`h-12 rounded-full px-[22px] text-base font-bold ${on ? 'bg-brown text-page' : 'border-[1.5px] border-[#D9C49C] bg-white text-[#4A3A2E]'}`}
      >
        {label} · {data[d]?.shipments.length ?? '…'}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="m-0 font-heading text-3xl font-normal text-ink md:text-[42px]">Shipments</h1>
        <p className="mt-2 max-w-[720px] text-lg text-[#4A3A2E]">
          Everything on its way to or from {needsStore ? 'a store' : store ?? 'your store'}, who is carrying it, and where it was last seen.
        </p>
      </div>

      <AdminStorePicker purpose="to see its shipments" />
      {needsStore ? (
        <EmptyState title="Pick a store" body="Shipments belong to one store. Choose it above to see what is coming in and going out." />
      ) : (<>

      {sample && <Banner title="Sample data.">The shipments service is not live yet, so this page shows example shipments. Changes last until you reload.</Banner>}
      {error && <Banner tone="danger" title="Could not load shipments.">{error}</Banner>}

      <div role="tablist" aria-label="Direction" className="flex flex-wrap gap-2">
        {tab('in', 'Coming in')}
        {tab('out', 'Going out')}
      </div>

      {!reply ? (
        <Skeleton className="h-96" />
      ) : rows.length === 0 ? (
        <EmptyState
          title={dir === 'in' ? 'Nothing coming in' : 'Nothing going out'}
          body={dir === 'in' ? 'Approved requests from other stores show here until you mark them received.' : 'Requests you approve show here so you can assign a driver.'}
        />
      ) : (
        <>
          {current && (
            <ShipmentCard
              key={current.id}
              s={current}
              dir={dir}
              drivers={drivers}
              onAssign={async (driverId) => {
                applyNow(await assignDriver(current.id, driverId));
                setSelected(current.id);
                void load();
              }}
              onReceive={async (qty) => {
                applyNow(await receiveShipment(current.id, qty));
                setSelected(current.id);
                void load();
              }}
            />
          )}
          <section className="flex flex-col gap-3.5">
            <h2 className="m-0 font-heading text-[26px] font-normal">{dir === 'in' ? 'All coming in' : 'All going out'}</h2>
            <ShipmentsTable
              dir={dir}
              rows={rows}
              selectedId={current?.id ?? null}
              onSelect={setSelected}
              drivers={drivers}
              onAssign={async (id, driverId) => {
                applyNow(await assignDriver(id, driverId));
                setSelected(id);
                void load();
              }}
            />
          </section>
        </>
      )}
      </>)}
    </div>
  );
}
