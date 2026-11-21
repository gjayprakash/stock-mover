// One client for the driver phone. The driver APIs (#81 pairing, #82 trip and pings) may not be
// deployed yet: any call that comes back 404 falls back to a local mock, so /pair and /driver work today.

export type Lang = 'hi' | 'en';

export interface DriverMe {
  name: string;
  lang: Lang | null;
  store: string;
  manager_name: string;
  manager_phone: string;
}

export interface DriverTrip {
  id: string;
  status: 'assigned' | 'in_transit';
  from_store_id: string;
  from_store_name: string;
  to_store_id: string;
  to_store_name: string;
  pieces: number;
  manager_phone: string;
  last_ping_at: string | null;
}

export interface PingBody {
  lat: number;
  lng: number;
  accuracy: number;
  taken_at: string;
}

/** The phone is not paired (no device cookie, or the manager turned it off). */
export class Unpaired extends Error {}
/** No network: the request never reached us. */
export class Offline extends Error {}

const MOCK_KEY = 'sm.driver.mock';
type MockState = { status: DriverTrip['status'] | 'delivered'; last_ping_at: string | null; lang: Lang | null };

function readMock(): MockState {
  try {
    const raw = localStorage.getItem(MOCK_KEY);
    if (raw) return JSON.parse(raw) as MockState;
  } catch { /* fall through */ }
  return { status: 'assigned', last_ping_at: null, lang: null };
}
function writeMock(patch: Partial<MockState>) {
  try { localStorage.setItem(MOCK_KEY, JSON.stringify({ ...readMock(), ...patch })); } catch { /* ignore */ }
}

const MOCK_PHONE = '+910000000000';
const mockMe = (): DriverMe => ({
  name: 'Demo driver',
  lang: readMock().lang,
  store: 'Lucknow LKO-02',
  manager_name: 'Store manager',
  manager_phone: MOCK_PHONE,
});
const mockTrip = (): DriverTrip | null => {
  const m = readMock();
  if (m.status === 'delivered') return null;
  return {
    id: 'mock-1',
    status: m.status,
    from_store_id: 'LKO-02',
    from_store_name: 'Lucknow',
    to_store_id: 'LKO-04',
    to_store_name: 'Lucknow',
    pieces: 4,
    manager_phone: MOCK_PHONE,
    last_ping_at: m.last_ping_at,
  };
};

async function call<T>(method: string, path: string, body: unknown, mock: () => T): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/driver/${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Offline();
  }
  if (res.status === 404) return mock();
  if (res.status === 401 || res.status === 403) throw new Unpaired();
  if (!res.ok) throw new Error(`${method} /api/driver/${path}: ${res.status}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const driverApi = {
  // Mock: joining again starts the demo trip over.
  pair: (token: string) => call<void>('POST', 'pair', { token }, () => writeMock({ status: 'assigned', last_ping_at: null })),
  me: () => call<DriverMe>('GET', 'me', undefined, mockMe),
  /** Store and manager behind a pair link, before Join (does not use the link). */
  preview: (token: string) => call<Pick<DriverMe, 'name' | 'store' | 'manager_name'>>('POST', 'pair-preview', { token }, mockMe),
  setLang: (lang: Lang) => call<void>('PATCH', 'me', { lang }, () => writeMock({ lang })),
  // #82 may answer with one trip, a list, or nothing: the phone shows the first open one.
  trip: () =>
    call<DriverTrip | DriverTrip[] | null>('GET', 'trip', undefined, mockTrip).then((t) =>
      Array.isArray(t) ? (t[0] ?? null) : (t ?? null),
    ),
  pickedUp: () => call<void>('POST', 'picked-up', {}, () => writeMock({ status: 'in_transit' })),
  ping: (p: PingBody) => call<void>('POST', 'ping', p, () => writeMock({ last_ping_at: p.taken_at })),
  delivered: (photo?: string) => call<void>('POST', 'delivered', photo ? { photo } : {}, () => writeMock({ status: 'delivered' })),
};

// Offline pings wait here and go out when the phone is back online (accepted up to 24 h late).
const QUEUE_KEY = 'sm.driver.pings';
function readQueue(): PingBody[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as PingBody[]; } catch { return []; }
}
function writeQueue(q: PingBody[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* ignore */ }
}

/** Sends a ping, or queues it when there is no network. Returns false when it was queued. */
export async function sendPing(p: PingBody): Promise<boolean> {
  try {
    await driverApi.ping(p);
    return true;
  } catch (e) {
    if (!(e instanceof Offline)) throw e;
    writeQueue([...readQueue(), p]);
    return false;
  }
}

let flushing = false;
export async function flushPings() {
  if (flushing) return;
  flushing = true;
  try {
    const dayAgo = Date.now() - 24 * 3600_000;
    let q = readQueue().filter((p) => Date.parse(p.taken_at) > dayAgo);
    while (q.length) {
      try { await driverApi.ping(q[0]); } catch (e) { if (e instanceof Offline) break; }
      q = q.slice(1);
      writeQueue(q);
    }
    if (!q.length) writeQueue([]);
  } finally {
    flushing = false;
  }
}
