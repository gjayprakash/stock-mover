/**
 * Client for the Requests API (#79). Every call tries the real API first; while the route is not deployed
 * (404), or in dev when the API is unreachable, it answers from the in-memory demo in ./mock.ts so the screen
 * works today and switches to real data by itself once #79 is live.
 */

export type RequestStatus =
  | 'waiting'
  | 'needs_signoff'
  | 'approved'
  | 'driver_assigned'
  | 'on_the_way'
  | 'delivered'
  | 'received'
  | 'declined'
  | 'cancelled';

export type BlockedReason = 'flagship_top20' | 'under_30_days' | 'under_display_min' | 'none_in_stock';
export type DeclineReason = 'need_it_here' | 'count_wrong' | 'other';

/** One row of GET /api/requests/sources, ranked by travel days, then km, then can_spare; WH-KOL last. */
export type SourceOption = {
  location_id: string;
  name: string;
  km: number;
  days: number;
  can_spare: number;
  closest: boolean;
  blocked_reason: BlockedReason | null;
};

export type SourcesReply = {
  sources: SourceOption[];
  /** The asking store's own stock of the SKU and weekly sales, when the API sends them. */
  on_hand?: number;
  per_week?: number;
};

export type TransferRequest = {
  id: string;
  sku_id: string;
  style_name?: string;
  size?: string;
  qty: number;
  from_location: string;
  to_location: string;
  status: RequestStatus;
  value_mrp: number;
  needs_signoff: boolean;
  reason?: string | null;
  created_at: string;
  updated_at: string;
  /** Giver's stock of the SKU now, and its days of cover after sending (incoming box only). */
  giver_on_hand?: number;
  giver_cover_days_after?: number | null;
  /** Travel days for the route (lead_times tab). */
  days?: number;
};

export type Me = { store_id: string | null; role: string | null };

export class Unavailable extends Error {}
/** 400 / 403 / 409 from the API: the message is shown as is. */
export class Refused extends Error {}

const NOT_DEPLOYED = Symbol('not-deployed');

async function call<T>(path: string, init?: RequestInit): Promise<T | typeof NOT_DEPLOYED> {
  let r: Response;
  try {
    r = await fetch(path, init);
  } catch (e) {
    if (import.meta.env.DEV) return NOT_DEPLOYED;
    throw new Unavailable(String(e));
  }
  if (r.status === 404) return NOT_DEPLOYED;
  const text = await r.text();
  // Dev proxy with no API behind it answers an empty 5xx.
  if (r.status >= 500 && !text && import.meta.env.DEV) return NOT_DEPLOYED;
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // SPA fallback (index.html) or a proxy error page: the route is not there yet.
    if (r.ok || import.meta.env.DEV) return NOT_DEPLOYED;
    throw new Unavailable(`HTTP ${r.status} from ${path}`);
  }
  if (r.status >= 500) throw new Unavailable(`HTTP ${r.status} from ${path}`);
  if (!r.ok) {
    const b = body as { error?: unknown; message?: unknown } | null;
    const msg = b?.error ?? b?.message;
    throw new Refused(Array.isArray(msg) ? msg.join(' ') : typeof msg === 'string' ? msg : `HTTP ${r.status}`);
  }
  return body as T;
}

/** True while any reply in this page load came from the demo data. */
export let usingDemo = false;

async function withMock<T>(real: () => Promise<T | typeof NOT_DEPLOYED>, demo: (m: typeof import('./mock')) => T): Promise<T> {
  const r = await real();
  if (r !== NOT_DEPLOYED) return r;
  usingDemo = true;
  const m = await import('./mock');
  await new Promise((res) => setTimeout(res, 250));
  return demo(m);
}

const post = (body?: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body ?? {}),
});

/** Signed-in user's store (`location_id`) and role from GET /api/me (#76). Sign-in off → both null. */
export async function getMe(): Promise<Me> {
  try {
    const r = await fetch('/api/me', { cache: 'no-store' });
    if (!r.ok) return { store_id: null, role: null };
    const me = (await r.json()) as { location_id?: string | null; role?: string | null };
    return { store_id: me.location_id ?? null, role: me.role ?? null };
  } catch {
    return { store_id: null, role: null };
  }
}

const storeQ = (store: string) => `store=${encodeURIComponent(store)}`;

export function getSources(store: string, sku: string, qty: number) {
  return withMock<SourcesReply>(
    async () => {
      const r = await call<SourceOption[] | SourcesReply>(
        `/api/requests/sources?sku=${encodeURIComponent(sku)}&qty=${qty}&${storeQ(store)}`,
      );
      if (r === NOT_DEPLOYED) return r;
      return Array.isArray(r) ? { sources: r } : r;
    },
    (m) => m.sources(store, sku),
  );
}

export function listRequests(store: string, box: 'incoming' | 'mine') {
  return withMock<TransferRequest[]>(
    async () => {
      const r = await call<TransferRequest[] | { requests: TransferRequest[] }>(`/api/requests?box=${box}&${storeQ(store)}`);
      if (r === NOT_DEPLOYED) return r;
      return Array.isArray(r) ? r : r.requests;
    },
    (m) => m.list(store, box),
  );
}

export function createRequest(store: string, body: { sku_id: string; qty: number; from_location: string }) {
  return withMock<TransferRequest>(
    () => call<TransferRequest>('/api/requests', post({ ...body, to_location: store })),
    (m) => m.create(store, body),
  );
}

export type Action = 'approve' | 'decline' | 'cancel' | 'signoff';

export function act(store: string, id: string, action: Action, reason?: DeclineReason) {
  return withMock<TransferRequest>(
    () => call<TransferRequest>(`/api/requests/${encodeURIComponent(id)}/${action}`, post(reason ? { reason } : undefined)),
    (m) => m.act(store, id, action, reason),
  );
}
