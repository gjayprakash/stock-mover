import { useAuth } from './auth';
import { useLocations } from './viewing';

/**
 * Super admin only: which store this page acts for. It is the same Viewing choice as the sidebar
 * (every /api call then carries ?location=). Store managers never see it: they always act for their own store.
 */
export function AdminStorePicker({ purpose }: { purpose: string }) {
  const { isAdmin, viewing, setViewing } = useAuth();
  const locations = useLocations();
  if (!isAdmin) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="page-store" className="text-sm font-semibold">Store</label>
      <select
        id="page-store"
        value={viewing ?? ''}
        onChange={(e) => setViewing(e.target.value || null)}
        className="h-12 max-w-sm rounded-xl border-[1.5px] border-[#D9C49C] bg-white px-3 text-base"
      >
        <option value="">Pick a store {purpose}</option>
        {locations.map((l) => (
          <option key={l.store_id} value={l.store_id}>{l.city} {l.store_id}</option>
        ))}
      </select>
    </div>
  );
}

/** True when a super admin is on "All locations": pages that act for one store must ask for one first. */
export function useNeedsStore(): boolean {
  const { isAdmin, viewing } = useAuth();
  return isAdmin && !viewing;
}
