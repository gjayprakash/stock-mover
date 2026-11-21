/**
 * Sample shipments for one store (KNP-02, Kanpur) used while GET /api/shipments answers 404 (#82 not live).
 * Real store ids, styles and MRPs from data/csv; times are relative to now so "time ago" and the
 * "No update for 3 h" / "Late" states show. Assign and receive change this in-memory copy until reload.
 */
import type { Dir, Driver, Ping, Shipment, ShipmentsReply } from './api';

const ME = 'KNP-02';
const H = 3_600_000;
const ago = (h: number) => new Date(Date.now() - h * H).toISOString();
const day = (d: number) => new Date(Date.now() + d * 86_400_000 + 330 * 60_000).toISOString().slice(0, 10);
const ping = (place: string, lat: number, lng: number, h: number): Ping => ({ place, lat, lng, taken_at: ago(h) });

const DRIVERS: Driver[] = [
  { id: 'drv-1', name: 'Manoj Verma', phone_e164: '+919800000101', status: 'Paired' },
  { id: 'drv-2', name: 'Arif Khan', phone_e164: '+919800000102', status: 'Paired' },
  { id: 'drv-3', name: 'Deepak Singh', phone_e164: '+919800000103', status: 'Link sent' },
];
const OTHER = { id: 'drv-9', name: 'Suresh Pal', phone_e164: '+919800000109' };

const base = { picked_up_at: null, delivered_at: null, received_at: null, qty_received: null, pings: [] as Ping[], driver: null };

const ROWS: Shipment[] = [
  {
    ...base,
    id: 'shp-101', request_id: 'req-101', sku_id: 'SHW-03-L', style_name: 'Ivory Silk Zari Sherwani', size: 'L',
    qty: 3, value_mrp: 3 * 21799, from_id: 'KNP-01', to_id: ME, status: 'in_transit', due_date: day(1), lead_time_days: 2,
    requested_at: ago(26), approved_at: ago(25), picked_up_at: ago(5), driver: OTHER,
    pings: [ping('Govind Nagar, Kanpur', 26.44, 80.31, 0.8), ping('Kidwai Nagar, Kanpur', 26.42, 80.33, 2.1), ping('Picked up at KNP-01', 26.47, 80.35, 5)],
  },
  {
    ...base,
    id: 'shp-102', request_id: 'req-102', sku_id: 'SHW-02-M', style_name: 'Mint Brocade Sherwani', size: 'M',
    qty: 2, value_mrp: 2 * 27699, from_id: 'LKO-02', to_id: ME, status: 'in_transit', due_date: day(-1), lead_time_days: 4,
    requested_at: ago(110), approved_at: ago(100), picked_up_at: ago(30), driver: { id: 'drv-8', name: 'Rakesh Tiwari', phone_e164: '+919800000108' },
    pings: [ping('Unnao bypass', 26.55, 80.49, 4.5), ping('Nawabganj, Unnao', 26.86, 80.75, 9), ping('Picked up at LKO-02', 26.85, 80.95, 30)],
  },
  {
    ...base,
    id: 'shp-105', request_id: 'req-105', sku_id: 'SHW-07-M', style_name: 'Lilac Threadwork Sherwani', size: 'M',
    qty: 1, value_mrp: 26799, from_id: 'KNP-01', to_id: ME, status: 'in_transit', due_date: day(1), lead_time_days: 2,
    requested_at: ago(28), approved_at: ago(27), picked_up_at: ago(6), driver: OTHER,
    pings: [ping('Rawatpur, Kanpur', 26.49, 80.29, 3.4), ping('Picked up at KNP-01', 26.47, 80.35, 6)],
  },
  {
    ...base,
    id: 'shp-103', request_id: 'req-103', sku_id: 'SHW-08-XL', style_name: 'Teal Brocade Sherwani', size: 'XL',
    qty: 4, value_mrp: 4 * 26399, from_id: 'WH-KOL', to_id: ME, status: 'approved', due_date: day(3), lead_time_days: 4,
    requested_at: ago(8), approved_at: ago(6),
  },
  {
    ...base,
    id: 'shp-104', request_id: 'req-104', sku_id: 'SHW-04-M', style_name: 'Champagne Silk Zari Sherwani', size: 'M',
    qty: 2, value_mrp: 2 * 16299, from_id: 'LKO-01', to_id: ME, status: 'received', due_date: day(-2), lead_time_days: 4,
    requested_at: ago(150), approved_at: ago(148), picked_up_at: ago(120), delivered_at: ago(60), received_at: ago(59), qty_received: 2,
    driver: { id: 'drv-7', name: 'Imran Ali', phone_e164: '+919800000107' },
    pings: [ping('Delivered at KNP-02', 26.46, 80.32, 60), ping('Unnao bypass', 26.55, 80.49, 70)],
  },
  {
    ...base,
    id: 'shp-201', request_id: 'req-201', sku_id: 'SHW-05-L', style_name: 'Rust Silk Zari Sherwani', size: 'L',
    qty: 2, value_mrp: 2 * 22699, from_id: ME, to_id: 'LKO-03', status: 'approved', due_date: day(4), lead_time_days: 4,
    requested_at: ago(4), approved_at: ago(3),
  },
  {
    ...base,
    id: 'shp-202', request_id: 'req-202', sku_id: 'SHW-06-M', style_name: 'Lilac Velvet Embroidered Sherwani', size: 'M',
    qty: 1, value_mrp: 16799, from_id: ME, to_id: 'KNP-01', status: 'delivered', due_date: day(0), lead_time_days: 2,
    requested_at: ago(30), approved_at: ago(29), picked_up_at: ago(7), delivered_at: ago(5), driver: { ...DRIVERS[0] },
    pings: [ping('Delivered at KNP-01', 26.47, 80.35, 5), ping('Rawatpur, Kanpur', 26.49, 80.29, 6)],
  },
];

const dirOf = (s: Shipment): Dir => (s.to_id === ME ? 'in' : 'out');

export function list(dir: Dir): ShipmentsReply {
  return { store_id: ME, shipments: ROWS.filter((s) => dirOf(s) === dir).map((s) => ({ ...s })) };
}

export function drivers(): Driver[] {
  return DRIVERS;
}

function find(id: string): Shipment {
  const s = ROWS.find((r) => r.id === id);
  if (!s) throw new Error('Shipment not found');
  return s;
}

export function assign(id: string, driverId: string): Shipment {
  const s = find(id);
  const d = DRIVERS.find((x) => x.id === driverId && x.status === 'Paired');
  if (!d) throw new Error('Pick a paired driver from your store');
  if (s.from_id !== ME || s.status !== 'approved') throw new Error('Only an approved going-out shipment can get a driver');
  Object.assign(s, { driver: { id: d.id, name: d.name, phone_e164: d.phone_e164 }, status: 'assigned' });
  return { ...s };
}

export function receive(id: string, qty: number): Shipment {
  const s = find(id);
  if (s.to_id !== ME || s.status === 'received') throw new Error('Only the receiving store can mark this received');
  if (!Number.isInteger(qty) || qty < 0 || qty > s.qty) throw new Error(`Enter 0 to ${s.qty} pieces`);
  Object.assign(s, { status: 'received', received_at: new Date().toISOString(), qty_received: qty, delivered_at: s.delivered_at ?? new Date().toISOString() });
  return { ...s };
}
