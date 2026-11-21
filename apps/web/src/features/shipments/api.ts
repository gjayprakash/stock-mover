/**
 * Client for the shipments API (#82) and the drivers list (#81). Until those routes exist the API answers
 * 404 (or, on a laptop without the API, cannot be reached): then the in-memory sample in ./mock.ts is used,
 * so the screen works end to end. `sample: true` on a reply tells the page to say so.
 */

export type Dir = 'in' | 'out';
export type ShipmentStatus = 'approved' | 'assigned' | 'in_transit' | 'delivered' | 'received';

export type Ping = { place: string; lat: number; lng: number; taken_at: string };

export type Shipment = {
  id: string;
  request_id: string;
  sku_id: string;
  style_name: string;
  size: string;
  qty: number;
  value_mrp: number;
  from_id: string;
  to_id: string;
  status: ShipmentStatus;
  /** Calendar date (YYYY-MM-DD) = approved date + lead_times days for the route. */
  due_date: string;
  lead_time_days: number;
  driver: { id: string; name: string; phone_e164: string } | null;
  requested_at: string;
  approved_at: string;
  picked_up_at: string | null;
  delivered_at: string | null;
  received_at: string | null;
  qty_received: number | null;
  /** Newest first. */
  pings: Ping[];
};

export type Driver = { id: string; name: string; phone_e164: string; status: string };

export type ShipmentsReply = { store_id: string; shipments: Shipment[]; sample?: true };

class NotThere extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, { cache: 'no-store', ...init });
  } catch {
    throw new NotThere(path);
  }
  if (r.status === 404 || (import.meta.env.DEV && r.status >= 500)) throw new NotThere(path);
  const body = await r.json().catch(() => {
    throw new NotThere(path);
  });
  if (!r.ok) throw new Error((body as { message?: string })?.message ?? `HTTP ${r.status}`);
  return body as T;
}

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

async function orSample<T>(real: () => Promise<T>, sample: (m: typeof import('./mock')) => T): Promise<T & { sample?: true }> {
  try {
    return (await real()) as T & { sample?: true };
  } catch (e) {
    if (!(e instanceof NotThere)) throw e;
    const m = await import('./mock');
    return Object.assign(sample(m) as object, { sample: true as const }) as T & { sample?: true };
  }
}

/** GET /api/shipments?dir=in|out */
export function listShipments(dir: Dir) {
  return orSample<ShipmentsReply>(
    () => call(`/api/shipments?dir=${dir}`),
    (m) => m.list(dir),
  );
}

/** GET /api/drivers → this store's drivers; the picker shows only paired ones. */
export function listDrivers() {
  return orSample<{ drivers: Driver[] }>(
    async () => {
      const body = await call<Driver[] | { drivers: Driver[] }>('/api/drivers');
      return { drivers: Array.isArray(body) ? body : body.drivers };
    },
    (m) => ({ drivers: m.drivers() }),
  );
}

/** POST /api/shipments/:id/assign {driver_id} */
export function assignDriver(id: string, driver_id: string) {
  return orSample<Shipment>(
    () => call(`/api/shipments/${encodeURIComponent(id)}/assign`, post({ driver_id })),
    (m) => m.assign(id, driver_id),
  );
}

/** POST /api/shipments/:id/receive {qty_received} */
export function receiveShipment(id: string, qty_received: number) {
  return orSample<Shipment>(
    () => call(`/api/shipments/${encodeURIComponent(id)}/receive`, post({ qty_received })),
    (m) => m.receive(id, qty_received),
  );
}
