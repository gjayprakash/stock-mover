/**
 * Stand-in for the drivers API until #81 is deployed (used only after the API answers 404). In memory, per tab.
 * A link made here is "tapped" by the pretend phone PAIR_AFTER_MS later, so the Connected flip can be seen.
 */
import { whatsAppMessage, type Driver, type PairLink } from './api';

const MANAGER = { name: 'Store manager', store: 'Lucknow LKO-01' };
const PAIR_AFTER_MS = 12_000;
const LINK_MS = 30 * 60_000;
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const drivers: Driver[] = [
  { id: 'd1', name: 'Rajesh Tiwari', mobile: '9839012457', status: 'PAIRED', link_expires_at: null, last_ping_at: ago(47), last_ping_place: 'Hazratganj, Lucknow', load: { pieces: 6, to: 'LKO-01' } },
  { id: 'd2', name: 'Imran Qureshi', mobile: '9415538820', status: 'PAIRED', link_expires_at: null, last_ping_at: ago(190), last_ping_place: 'Kanpur Road, near Amausi', load: null },
  { id: 'd3', name: 'Vijay Prajapati', mobile: '7007641193', status: 'LINK_EXPIRED', link_expires_at: ago(95), last_ping_at: null, last_ping_place: null, load: null },
  { id: 'd4', name: 'Santosh Nishad', mobile: '8299107356', status: 'TURNED_OFF', link_expires_at: null, last_ping_at: ago(60 * 24 * 9), last_ping_place: 'Gomti Nagar, Lucknow', load: null },
];
/** driver id → when the pretend phone taps its current link. */
const tapAt = new Map<string, number>();

function find(id: string): Driver {
  const d = drivers.find((x) => x.id === id);
  if (!d) throw new Error('Driver not found.');
  return d;
}

/** Lazily applies the pretend tap and link expiry. */
function settle(d: Driver): Driver {
  const t = tapAt.get(d.id);
  if (d.status === 'LINK_SENT' && t && Date.now() >= t) {
    Object.assign(d, { status: 'PAIRED', link_expires_at: null });
    tapAt.delete(d.id);
  }
  if (d.status === 'LINK_SENT' && d.link_expires_at && Date.parse(d.link_expires_at) < Date.now()) d.status = 'LINK_EXPIRED';
  return { ...d };
}

function link(d: Driver): PairLink {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[b & 63]).join('');
  Object.assign(d, { status: 'LINK_SENT', link_expires_at: new Date(Date.now() + LINK_MS).toISOString() });
  tapAt.set(d.id, Date.now() + PAIR_AFTER_MS);
  const pair_url = `${location.origin}/pair#${token}`;
  return { driver: { ...d }, pair_url, message: whatsAppMessage(d.name, pair_url, MANAGER) };
}

export const list = () => drivers.map(settle);
export const get = (id: string) => settle(find(id));

export function create(name: string, mobile: string): PairLink {
  const d: Driver = { id: `d${Date.now()}`, name, mobile, status: 'LINK_SENT', link_expires_at: null, last_ping_at: null, last_ping_place: null, load: null };
  drivers.unshift(d);
  return link(d);
}

export const pairLink = (id: string) => link(find(id));

export function revoke(id: string): Driver {
  const d = find(id);
  tapAt.delete(id);
  Object.assign(d, { status: 'TURNED_OFF', link_expires_at: null });
  return { ...d };
}
