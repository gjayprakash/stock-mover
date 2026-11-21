import type { GeoResult, NearestLocation, NewStoreRequest } from '@sm/contract';

/** Shapes returned by apps/api/src/stores/stores.controller.ts. */
export type GeoLookup = GeoResult & { nearest: NearestLocation[] };
export type FieldError = { field: string; message: string };
export type CreatedStore = {
  store: NewStoreRequest & { state: string; zone: string; stock_capacity_units: number };
  nearest: NearestLocation[];
};

/** The API (or its route) could not be reached: network error, 5xx, or a non-JSON reply. */
export class Unavailable extends Error {}

type Reply = { status: number; body: unknown };

async function call(path: string, init?: RequestInit): Promise<Reply> {
  try {
    const r = await fetch(path, init);
    const text = await r.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Unavailable(`non-JSON reply from ${path}`);
    }
    if (r.status >= 500) throw new Unavailable(`HTTP ${r.status} from ${path}`);
    return { status: r.status, body };
  } catch (e) {
    if (e instanceof Unavailable) throw e;
    throw new Unavailable(String(e));
  }
}

/**
 * Real API first. In dev only, when the API is unreachable (no DATABASE_URL on a laptop), fall back to the
 * fake in ./fake.ts so every state can be checked. Production never uses fake data.
 */
async function withFake<T>(real: () => Promise<T>, fake: (f: typeof import('./fake')) => T): Promise<T & { fake?: true }> {
  try {
    return (await real()) as T & { fake?: true };
  } catch (e) {
    if (!(e instanceof Unavailable) || !import.meta.env.DEV) throw e;
    const f = await import('./fake');
    await new Promise((r) => setTimeout(r, 500)); // feel like a network call, so "Saving…" can be seen
    return Object.assign(fake(f) as object, { fake: true as const }) as T & { fake?: true };
  }
}

const errorsOf = (body: unknown): FieldError[] =>
  Array.isArray((body as { errors?: unknown })?.errors) ? (body as { errors: FieldError[] }).errors : [];

export type GeoReply = { ok: true; geo: GeoLookup } | { ok: false; notFound: true };

/** GET /api/geo?pin= → place + nearest list, or 404 when the PIN is not in the bundled table. */
export function lookupPin(pin: string) {
  return withFake<GeoReply>(
    async () => {
      const r = await call(`/api/geo?pin=${encodeURIComponent(pin)}`);
      if (r.status === 404) return { ok: false, notFound: true };
      if (r.status !== 200) throw new Unavailable(`HTTP ${r.status}`);
      return { ok: true, geo: r.body as GeoLookup };
    },
    (f) => f.fakeLookupPin(pin),
  );
}

/** GET /api/geo/nearest?lat=&lng= (the "set it by hand" path). */
export function nearestTo(lat: number, lng: number) {
  return withFake<{ nearest: NearestLocation[] }>(
    async () => {
      const r = await call(`/api/geo/nearest?lat=${lat}&lng=${lng}`);
      if (r.status !== 200) throw new Unavailable(`HTTP ${r.status}`);
      return r.body as { nearest: NearestLocation[] };
    },
    (f) => ({ nearest: f.fakeNearest({ lat, lng }) }),
  );
}

/** GET /api/stores/next-code?city= → next free code like GAY-01. Null when the city is too short. */
export function nextCode(city: string) {
  return withFake<{ store_id: string | null }>(
    async () => {
      const r = await call(`/api/stores/next-code?city=${encodeURIComponent(city)}`);
      if (r.status === 400) return { store_id: null };
      if (r.status !== 200) throw new Unavailable(`HTTP ${r.status}`);
      return r.body as { store_id: string };
    },
    (f) => ({ store_id: f.fakeNextCode(city) }),
  );
}

export type CreateReply = { ok: true; created: CreatedStore } | { ok: false; errors: FieldError[] };

/** POST /api/stores. 400 → { errors: [{ field, message }] }. */
export function createStore(body: NewStoreRequest) {
  return withFake<CreateReply>(
    async () => {
      const r = await call('/api/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.status === 400) return { ok: false, errors: errorsOf(r.body) };
      if (r.status !== 200 && r.status !== 201) throw new Unavailable(`HTTP ${r.status}`);
      return { ok: true, created: r.body as CreatedStore };
    },
    (f) => f.fakeCreate(body),
  );
}
