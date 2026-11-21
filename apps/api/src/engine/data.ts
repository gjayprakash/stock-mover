import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';

export type Store = {
  store_id: string; city: string; state: string; zone: string; tier: string;
  size_sqft: number; stock_capacity_units: number; opened_on: string; area_manager_id: string;
};
export type Item = {
  sku_id: string; style_id: string; style_name: string; category: string; size: string;
  mrp: number; cost_price: number; launch_date: string; is_core_style: boolean; is_packaging: boolean;
};
export type Bill = { bill_id: string; bill_date: string; store_id: string };
export type BillLine = { bill_id: string; sku_id: string; qty: number; mrp: number; selling_price: number };
export type SnapshotRow = {
  location_id: string; sku_id: string; on_hand: number; in_transit: number;
  in_transit_arrives_on: string | null; oldest_stock_received_on: string | null;
};
export type WeeklyRow = { week_ending: string; store_id: string; sku_id: string; closing_on_hand: number; days_in_stock: number };
export type InboundRow = { expected_date: string; sku_id: string; qty: number; status: string };
export type CalendarRow = { date: string; state: string; festival: string | null; is_wedding_date: boolean };
export type MinDisplayRow = { tier: string; category: string; min_display_units: number };
export type LeadTimeRow = { route: string; days: number };
export type FlagshipRow = { store_id: string; rank: number; style_id: string };

export type EngineData = {
  stores: Store[]; items: Item[]; bills: Bill[]; bill_lines: BillLine[];
  stock_snapshot: SnapshotRow[]; stock_weekly: WeeklyRow[]; warehouse_inbound: InboundRow[];
  calendar: CalendarRow[]; min_display: MinDisplayRow[]; lead_times: LeadTimeRow[];
  flagship_protected: FlagshipRow[];
};

type Raw = Record<string, string>;

function readTable(dataDir: string, name: string, columns: string[]): Raw[] {
  const file = join(dataDir, `${name}.csv`);
  if (!existsSync(file)) throw new Error(`engine: missing data file ${file}`);
  const rows: Raw[] = parse(readFileSync(file), { columns: true, skip_empty_lines: true, trim: true, cast: false });
  const header = rows.length ? Object.keys(rows[0]) : [];
  for (const c of columns) {
    if (!header.includes(c)) throw new Error(`engine: ${name}.csv is missing column "${c}"`);
  }
  return rows;
}

function num(v: string, ctx: string): number {
  const n = Number(v);
  if (v === '' || !Number.isFinite(n)) throw new Error(`engine: not a number "${v}" in ${ctx}`);
  return n;
}
const blank = (v: string) => (v === '' ? null : v);

/** Load the 11 Stock Mover tables. IDs stay strings; numbers converted explicitly. Fails loudly.
 *  extraStores = stores added in the app (#21); appended after stores.csv, zero stock until stock arrives. */
export function loadData(dataDir: string, extraStores: Store[] = []): EngineData {
  const t = (name: string, cols: string[]) => readTable(dataDir, name, cols);
  const csvStores: Store[] = t('stores', ['store_id', 'city', 'state', 'zone', 'tier', 'size_sqft', 'stock_capacity_units', 'opened_on', 'area_manager_id']).map((r) => ({
    store_id: r.store_id, city: r.city, state: r.state, zone: r.zone, tier: r.tier,
    size_sqft: num(r.size_sqft, 'stores.size_sqft'), stock_capacity_units: num(r.stock_capacity_units, 'stores.stock_capacity_units'),
    opened_on: r.opened_on, area_manager_id: r.area_manager_id,
  }));
  const known = new Set(csvStores.map((s) => s.store_id));
  return {
    stores: [...csvStores, ...extraStores.filter((s) => !known.has(s.store_id))],
    items: t('items', ['sku_id', 'style_id', 'style_name', 'category', 'size', 'mrp', 'cost_price', 'launch_date', 'is_core_style', 'is_packaging']).map((r) => ({
      sku_id: r.sku_id, style_id: r.style_id, style_name: r.style_name, category: r.category, size: r.size,
      mrp: num(r.mrp, 'items.mrp'), cost_price: num(r.cost_price, 'items.cost_price'), launch_date: r.launch_date,
      is_core_style: r.is_core_style === '1', is_packaging: r.is_packaging === '1',
    })),
    bills: t('bills', ['bill_id', 'bill_date', 'store_id']).map((r) => ({ bill_id: r.bill_id, bill_date: r.bill_date, store_id: r.store_id })),
    bill_lines: t('bill_lines', ['bill_id', 'sku_id', 'qty', 'mrp', 'selling_price']).map((r) => ({
      bill_id: r.bill_id, sku_id: r.sku_id, qty: num(r.qty, 'bill_lines.qty'), mrp: num(r.mrp, 'bill_lines.mrp'),
      selling_price: num(r.selling_price, 'bill_lines.selling_price'),
    })),
    stock_snapshot: t('stock_snapshot', ['location_id', 'sku_id', 'on_hand', 'in_transit', 'in_transit_arrives_on', 'oldest_stock_received_on']).map((r) => ({
      location_id: r.location_id, sku_id: r.sku_id, on_hand: num(r.on_hand, 'stock_snapshot.on_hand'),
      in_transit: num(r.in_transit, 'stock_snapshot.in_transit'), in_transit_arrives_on: blank(r.in_transit_arrives_on),
      oldest_stock_received_on: blank(r.oldest_stock_received_on),
    })),
    stock_weekly: t('stock_weekly', ['week_ending', 'store_id', 'sku_id', 'closing_on_hand', 'days_in_stock']).map((r) => ({
      week_ending: r.week_ending, store_id: r.store_id, sku_id: r.sku_id,
      closing_on_hand: num(r.closing_on_hand, 'stock_weekly.closing_on_hand'), days_in_stock: num(r.days_in_stock, 'stock_weekly.days_in_stock'),
    })),
    warehouse_inbound: t('warehouse_inbound', ['expected_date', 'sku_id', 'qty', 'status']).map((r) => ({
      expected_date: r.expected_date, sku_id: r.sku_id, qty: num(r.qty, 'warehouse_inbound.qty'), status: r.status,
    })),
    calendar: t('calendar', ['date', 'state', 'festival', 'is_wedding_date']).map((r) => ({
      date: r.date, state: r.state, festival: blank(r.festival), is_wedding_date: r.is_wedding_date === '1',
    })),
    min_display: t('min_display', ['tier', 'category', 'min_display_units']).map((r) => ({
      tier: r.tier, category: r.category, min_display_units: num(r.min_display_units, 'min_display.min_display_units'),
    })),
    lead_times: t('lead_times', ['route', 'days']).map((r) => ({ route: r.route, days: num(r.days, 'lead_times.days') })),
    flagship_protected: t('flagship_protected', ['store_id', 'rank', 'style_id']).map((r) => ({
      store_id: r.store_id, rank: num(r.rank, 'flagship_protected.rank'), style_id: r.style_id,
    })),
  };
}
