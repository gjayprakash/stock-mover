import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth';
import { listShipments } from '../shipments/api';

type Counts = { toDriver: number; comingIn: number };

/**
 * Today, for a store manager (or a super admin viewing one store): deliveries waiting on this store.
 * Going out without a pickup yet = hand to a driver; coming in and not yet received = coming in. Hidden when both are 0.
 */
export function DeliveriesCard() {
  const { me, isAdmin, viewing } = useAuth();
  const store = me?.role === 'store_manager' ? me.location_id ?? null : isAdmin ? viewing : null;
  const [c, setC] = useState<Counts | null>(null);

  useEffect(() => {
    if (!store) return;
    let live = true;
    Promise.all([listShipments('out'), listShipments('in')])
      .then(([out, inn]) => {
        if (!live || out.sample || inn.sample) return; // sample data is not this store's real work
        setC({
          toDriver: out.shipments.filter((s) => s.status === 'approved' || s.status === 'assigned').length,
          comingIn: inn.shipments.filter((s) => s.status !== 'received').length,
        });
      })
      .catch(() => { /* the Shipments page shows the error */ });
    return () => { live = false; };
  }, [store]);

  if (!store || !c || (c.toDriver === 0 && c.comingIn === 0)) return null;
  const row = (n: number, label: string) => (
    <Link to="/shipments" className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-page px-4 py-3 font-semibold text-ink no-underline hover:text-cta">
      <span>{label}</span>
      <span className="font-heading text-2xl">{n}</span>
    </Link>
  );
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-card md:p-6" aria-label="Deliveries to act on">
      <h2 className="m-0 font-heading text-xl font-normal text-ink">Deliveries to act on · {store}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {row(c.toDriver, 'To hand to a driver')}
        {row(c.comingIn, 'Coming in')}
      </div>
    </section>
  );
}
