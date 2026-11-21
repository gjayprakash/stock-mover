import type { StoreSummary } from '@sm/contract';
import { useMovesFile } from '../../data/useMovesFile';
import { useAuth } from './auth';

type Loc = Pick<StoreSummary, 'store_id' | 'city'>;

const VIEWING_KEY = 'sm:viewing';
const STORES_KEY = 'sm:all-stores';
export const WAREHOUSE = 'WH-KOL';

/** The super admin's Viewing choice, remembered per tab. null = all locations. */
export function readViewing(): string | null {
  try { return sessionStorage.getItem(VIEWING_KEY) || null; } catch { return null; }
}
export function writeViewing(id: string | null) {
  try {
    if (id) sessionStorage.setItem(VIEWING_KEY, id);
    else sessionStorage.removeItem(VIEWING_KEY);
  } catch { /* storage blocked: lasts until reload */ }
}

/** Calls that never take ?location= (who you are, sign-in, the managers list). */
const UNSCOPED = ['/api/me', '/api/auth/', '/api/invites/', '/api/users'];

/** Same-origin /api/* URL with ?location=<id> added, or null when it should go out untouched. */
export function scopedUrl(raw: string, location: string | null): string | null {
  if (!location) return null;
  const url = new URL(raw, window.location.href);
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return null;
  if (UNSCOPED.some((p) => url.pathname.startsWith(p)) || url.searchParams.has('location')) return null;
  url.searchParams.set('location', location);
  return url.pathname + url.search;
}

/**
 * Every store (stores from the moves file, warehouse last). While the super admin views one store the
 * moves file may hold only that store, so the full list seen under "All locations" is kept for this tab.
 */
export function useLocations(): Loc[] {
  const { data, isSample } = useMovesFile();
  const { isAdmin, viewing } = useAuth();
  const fresh = (data?.stores ?? []).filter((s) => s.store_id !== WAREHOUSE).map(({ store_id, city }) => ({ store_id, city }));
  let list = fresh;
  try {
    if (isAdmin && !viewing && !isSample && fresh.length) sessionStorage.setItem(STORES_KEY, JSON.stringify(fresh));
    else if (viewing) list = (JSON.parse(sessionStorage.getItem(STORES_KEY) ?? 'null') as Loc[] | null) ?? fresh;
  } catch { /* storage blocked: use what the file has */ }
  return [...list].sort((a, b) => a.store_id.localeCompare(b.store_id)).concat({ store_id: WAREHOUSE, city: 'Kolkata' });
}
