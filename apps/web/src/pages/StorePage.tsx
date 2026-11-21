import { Link, useParams } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { useMovesFile } from '../data/useMovesFile';
import { StoreDetail } from '../features/store/StoreDetail';
import { mostAtRisk } from '../features/store/storeText';

/** Serves /stores (opens the most at-risk store) and /stores/:id. */
export default function StorePage() {
  const { id } = useParams();
  const { data, loading } = useMovesFile();

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (!data || !data.stores?.length) {
    return <EmptyState title="No store figures yet" body="The daily run has not produced store figures. Check the Daily run page." />;
  }

  const store = id ? data.stores.find((s) => s.store_id === id) : mostAtRisk(data.stores);
  if (!store) {
    return (
      <EmptyState
        title={`No store called ${id}`}
        body="Pick a store from the list on the Today screen."
        action={<Link to="/stores" className="font-semibold text-[#A8340A]">Open the most at-risk store</Link>}
      />
    );
  }

  return <StoreDetail key={store.store_id} file={data} store={store} />;
}
