import { useAuth } from '../features/auth/auth';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Banner } from '../components/Banner';
import { Chip } from '../components/Chip';
import { EmptyState } from '../components/EmptyState';
import { Section } from '../components/Section';
import { Skeleton } from '../components/Skeleton';
import { useMovesFile } from '../data/useMovesFile';
import { getMe, listRequests, usingDemo, type Me, type TransferRequest } from '../features/requests/api';
import { AskForStock, type Product } from '../features/requests/AskForStock';
import { WaitingForYou } from '../features/requests/WaitingForYou';
import { YourRequests } from '../features/requests/YourRequests';

/** /requests (#80): ask the closest store for stock, answer other stores' asks, follow your own. API: #79. */
export default function RequestsPage() {
  const { data } = useMovesFile();
  const [me, setMe] = useState<Me | null>(null);
  const [params, setParams] = useSearchParams();
  const [boxes, setBoxes] = useState<{ incoming: TransferRequest[]; mine: TransferRequest[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => { getMe().then(setMe); }, []);

  const stores = data?.stores ?? [];
  const label = useCallback(
    (id: string) => (id === 'WH-KOL' ? 'Warehouse WH-KOL' : `${stores.find((s) => s.store_id === id)?.city ?? ''} ${id}`.trim()),
    [stores],
  );
  // A store manager sees their own store only. The super admin picks the Viewing store.
  const superAdmin = me?.role === 'super_admin';
  const fixed = superAdmin ? null : me?.store_id ?? null;
  const { viewing, setViewing } = useAuth();
  const store = fixed ?? params.get('store') ?? viewing ?? '';

  const products = useMemo<Product[]>(() => {
    const seen = new Map<string, Product>();
    for (const m of data?.moves ?? []) seen.set(m.sku_id, { sku_id: m.sku_id, style_name: m.style_name, size: m.size });
    return [...seen.values()].sort((a, b) => a.sku_id.localeCompare(b.sku_id));
  }, [data]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!store) return;
    let alive = true;
    setError(null);
    Promise.all([listRequests(store, 'incoming'), listRequests(store, 'mine')])
      .then(([incoming, mine]) => alive && setBoxes({ incoming, mine }))
      .catch(() => alive && setError('Requests are not available right now. Try again in a few minutes.'));
    return () => { alive = false; };
  }, [store, tick]);

  useEffect(() => { setBoxes(null); }, [store]);

  return (
    <div className="flex flex-col gap-10 md:gap-12">
      <div className="flex flex-col gap-3">
        <h1 className="m-0 font-heading text-3xl font-normal text-ink md:text-[42px]">Requests</h1>
        <p className="m-0 max-w-3xl text-lg text-muted">
          Ask the closest store for something you are short of, and answer what other stores ask of you.
        </p>
        {!me ? (
          <Skeleton className="h-8 w-64 rounded-full" />
        ) : fixed ? (
          <div><Chip>{label(fixed)} · you see this store only</Chip></div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="viewing-store" className="text-sm font-semibold">Viewing store</label>
            <select
              id="viewing-store"
              className="h-10 rounded-xl border-[1.5px] border-[#D9C49C] bg-[#FFFDF8] px-3 text-ink"
              value={store}
              onChange={(e) => { setParams(e.target.value ? { store: e.target.value } : {}, { replace: true }); if (superAdmin) setViewing(e.target.value || null); }}
            >
              <option value="">Pick a store to request for</option>
              {stores.map((s) => (
                <option key={s.store_id} value={s.store_id}>{label(s.store_id)}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {usingDemo && boxes && (
        <Banner title="Demo data.">The requests service is not live yet, so this page shows made-up requests that reset on reload.</Banner>
      )}
      {error && <Banner tone="danger" title={error} />}

      {me && !store ? (
        <EmptyState title="Pick a store to request for" body="Requests are made by one store. Choose it above." />
      ) : (
        store && (
          <>
            <Section n={1} title="Ask for stock" explainer="We only show stores that can give without breaking a rule.">
              <AskForStock store={store} products={products} onCreated={reload} />
            </Section>
            <Section n={2} title="Waiting for you" explainer="Other stores asked for your stock. It is your call.">
              {boxes ? (
                <WaitingForYou rows={boxes.incoming} label={label} superAdmin={superAdmin} store={store} onChanged={reload} />
              ) : (
                <Skeleton className="h-40 w-full rounded-2xl" />
              )}
            </Section>
            <Section n={3} title="Your requests">
              {boxes ? (
                <YourRequests rows={boxes.mine} label={label} store={store} onChanged={reload} />
              ) : (
                <Skeleton className="h-40 w-full rounded-2xl" />
              )}
            </Section>
          </>
        )
      )}
    </div>
  );
}
