/**
 * Client for the drivers API (#81). Shapes follow issue #81; the `Driver` type moves to @sm/contract when #81 lands.
 * Until the routes exist the API answers 404: from then on this module uses the in-memory mock in ./mock.ts,
 * so the screen works end to end (the mock phone "taps" the link a few seconds after it is made).
 */
import * as mock from './mock';

export type DriverStatus = 'PAIRED' | 'LINK_SENT' | 'LINK_EXPIRED' | 'TURNED_OFF';

export type Driver = {
  id: string;
  name: string;
  /** 10-digit Indian mobile, no +91. */
  mobile: string;
  status: DriverStatus;
  /** When the current pair link stops working; null when there is no live link. */
  link_expires_at: string | null;
  last_ping_at: string | null;
  last_ping_place: string | null;
  /** What the driver is carrying now, e.g. { pieces: 3, to: 'LKO-01' }; null when nothing. */
  load: { pieces: number; to: string } | null;
};

/** POST /api/drivers and POST /api/drivers/:id/pair-link. `message` is the server-built WhatsApp text. */
export type PairLink = { driver: Driver; pair_url: string; message: string };

export class ApiError extends Error {}

let useMock = false;

const NOT_FOUND = Symbol('404');

async function call(path: string, init?: RequestInit): Promise<unknown> {
  let r: Response;
  try {
    r = await fetch(path, { ...init, headers: init?.body ? { 'Content-Type': 'application/json' } : undefined, cache: 'no-store' });
  } catch {
    if (import.meta.env.DEV) return NOT_FOUND; // laptop without the API running
    throw new ApiError('Could not reach the server. Check the internet and try again.');
  }
  // 404: routes not deployed yet. Dev 5xx: Vite's proxy with no API behind it.
  if (r.status === 404 || (import.meta.env.DEV && r.status >= 500)) return NOT_FOUND;
  const body = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = (body as { message?: unknown } | null)?.message;
    throw new ApiError(typeof msg === 'string' ? msg : `Could not reach the server (HTTP ${r.status}).`);
  }
  return body;
}

/** Real API first; a 404 (routes not deployed yet) switches this tab to the mock for good. */
async function withMock<T>(real: () => Promise<unknown>, read: (body: unknown) => T, fake: () => T): Promise<T> {
  if (!useMock) {
    const body = await real();
    if (body !== NOT_FOUND) return read(body);
    useMock = true;
  }
  await new Promise((r) => setTimeout(r, 300));
  return fake();
}

/** Accepts the server's row with either `mobile` or `phone_e164`. */
function asDriver(raw: unknown): Driver {
  const d = ((raw as { driver?: unknown })?.driver ?? raw) as Record<string, unknown>;
  const phone = String(d.mobile ?? d.phone_e164 ?? '');
  return {
    id: String(d.id),
    name: String(d.name),
    mobile: phone.replace(/\D/g, '').slice(-10),
    status: (d.status as DriverStatus) ?? 'LINK_SENT',
    link_expires_at: (d.link_expires_at as string) ?? null,
    last_ping_at: (d.last_ping_at as string) ?? null,
    last_ping_place: (d.last_ping_place as string) ?? null,
    load: (d.load as Driver['load']) ?? null,
  };
}

function asPairLink(body: unknown): PairLink {
  const b = body as { pair_url: string; message?: string };
  const driver = asDriver(body);
  return { driver, pair_url: b.pair_url, message: b.message ?? whatsAppMessage(driver.name, b.pair_url) };
}

const post = (path: string, body?: unknown) => () => call(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const listDrivers = () =>
  withMock(
    () => call('/api/drivers'),
    (b) => ((Array.isArray(b) ? b : (b as { drivers: unknown[] }).drivers) ?? []).map(asDriver),
    mock.list,
  );

export const getDriver = (id: string) => withMock(() => call(`/api/drivers/${encodeURIComponent(id)}`), asDriver, () => mock.get(id));

export const createDriver = (name: string, mobile: string) =>
  withMock(post('/api/drivers', { name, mobile }), asPairLink, () => mock.create(name, mobile));

export const newPairLink = (id: string) =>
  withMock(post(`/api/drivers/${encodeURIComponent(id)}/pair-link`), asPairLink, () => mock.pairLink(id));

export const revokeDriver = (id: string) => withMock(post(`/api/drivers/${encodeURIComponent(id)}/revoke`), asDriver, () => mock.revoke(id));

/**
 * Hindi line + English line + link + manager name and store. The server builds this (#81); this copy is only
 * used by the mock or if the server leaves `message` out.
 */
export function whatsAppMessage(name: string, url: string, manager?: { name: string; store: string }): string {
  const first = name.trim().split(/\s+/)[0];
  return [
    `नमस्ते ${first} जी, Stock Mover से जुड़ने के लिए नीचे का लिंक दबाएँ।`,
    `Hello ${first}, tap the link below to join Stock Mover.`,
    url,
    ...(manager ? [`— ${manager.name}, Manyavar ${manager.store}`] : []),
  ].join('\n');
}

export const waUrl = (mobile: string, message: string) => `https://wa.me/91${mobile}?text=${encodeURIComponent(message)}`;

/** "9807311426" → "+91 98073 11426". */
export const showMobile = (m: string) => `+91 ${m.slice(0, 5)} ${m.slice(5)}`;

/** Accepts "98073 11426", "+91 98073-11426", "09807311426"; returns 10 digits or null. */
export function parseMobile(input: string): string | null {
  let d = input.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}
