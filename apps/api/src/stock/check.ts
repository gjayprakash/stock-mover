// Pure checks for the Add stock upload (#23). No Nest, no DB.
import type { StockRowError } from '@sm/contract';

export const COLUMNS = ['location_id', 'sku_id', 'style_name', 'size', 'category', 'mrp_inr', 'qty', 'received_on'] as const;
export type Column = (typeof COLUMNS)[number];
export type RawRow = Record<Column, string>;
export const CATEGORIES = ['Sherwani', 'Indo-Western', 'Kurta Set', 'Jacket', 'Mojari', 'Safa', 'Mala', 'Stole'];
export const MAX_ROWS = 5000;
export const MAX_QTY = 10000;
export const MAX_AGE_DAYS = 60;

/** The 3 example rows in the sample file (real SKUs). Ignored if left in an upload.
 *  Dated after the as-of date (2026-10-31), so they would also pass the received_on check. */
export const SAMPLE_ROWS: string[][] = [
  ['WH-KOL', 'KUR-02-M', 'Mustard Embroidered Yoke Kurta Set', 'M', 'Kurta Set', '6299', '24', '2026-11-01'],
  ['LKO-01', 'SHW-01-L', 'Wine Velvet Embroidered Sherwani', 'L', 'Sherwani', '24599', '3', '2026-11-01'],
  ['PAT-02', 'MOJ-01-9', 'Peach Leather Mojari', '9', 'Mojari', '2199', '6', '2026-11-02'],
];
/** Example rows of the sample file before the dates moved past the as-of date; still ignored so an old download gives 0 rows. */
const OLD_SAMPLE_ROWS: string[][] = [
  ['WH-KOL', 'KUR-02-M', 'Mustard Embroidered Yoke Kurta Set', 'M', 'Kurta Set', '6299', '24', '2026-10-30'],
  ['LKO-01', 'SHW-01-L', 'Wine Velvet Embroidered Sherwani', 'L', 'Sherwani', '24599', '3', '2026-10-30'],
  ['PAT-02', 'MOJ-01-9', 'Peach Leather Mojari', '9', 'Mojari', '2199', '6', '2026-10-29'],
];

export type CatalogItem = { sku_id: string; style_id: string; style_name: string; category: string; size: string; mrp: number };
export type CheckContext = {
  locations: Map<string, { capacity: number | null; stock_now: number }>; // stores + WH-KOL (capacity null)
  items: Map<string, CatalogItem>;
  asOf: string; // YYYY-MM-DD, date of the stock count: received_on must be after it (else it is already counted)
  today: string; // YYYY-MM-DD, server's date in India: received_on may not be after it
};
export type GoodRow = { row: number; location_id: string; sku_id: string; qty: number; received_on: string; newItem: CatalogItem | null };
export type CheckOutcome = {
  rows_total: number; good: GoodRow[]; failed: { row: number; values: string[]; error: string }[];
  errors: StockRowError[]; warnings: StockRowError[];
  by_location: { location_id: string; pieces: number; rows: number; over_capacity: boolean }[];
};

/** Header must be exactly COLUMNS in order. Returns the problem with the first wrong column, or null. */
export function checkHeader(header: string[]): string | null {
  const h = header.map((x) => x.trim().replace(/^﻿/, ''));
  for (let i = 0; i < COLUMNS.length; i++) {
    if (h[i] === COLUMNS[i]) continue;
    const at = h.indexOf(COLUMNS[i]);
    return at < 0
      ? `Column ${i + 1} should be "${COLUMNS[i]}" but it is missing${h[i] ? ` (found "${h[i]}")` : ''}. Use the sample file's header.`
      : `Column ${i + 1} should be "${COLUMNS[i]}" but it is "${h[i] ?? ''}" ("${COLUMNS[i]}" is in column ${at + 1}). Do not reorder columns.`;
  }
  // A trailing "error" column (from the rows-to-fix download) is allowed and ignored.
  const extra = h.slice(COLUMNS.length);
  if (extra[0]?.toLowerCase() === 'error' && !extra.slice(1).some((x) => x)) return null;
  if (h.length > COLUMNS.length && extra.some((x) => x)) return `Column ${COLUMNS.length + 1} "${h[COLUMNS.length]}" is extra. Remove it.`;
  return null;
}

const SKU = /^([A-Z]{2,4}-\d{2})-([A-Z0-9]{1,4})$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 2026-10-31 → "31 Oct 2026" */
const human = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/** Row-level checks on data rows (header already checked). `firstRow` = file line of rows[0].
 *  `allowNewItems` false (one typed-in row) → a product code not in the catalogue is a single sku_id error. */
export function checkRows(rows: string[][], ctx: CheckContext, firstRow = 2, allowNewItems = true): CheckOutcome {
  const errors: StockRowError[] = [];
  const warnings: StockRowError[] = [];
  const failed: CheckOutcome['failed'] = [];
  const good: GoodRow[] = [];
  const isSample = (r: string[]) => [...SAMPLE_ROWS, ...OLD_SAMPLE_ROWS].some((s) => s.every((v, i) => (r[i] ?? '').trim() === v));
  let total = 0;
  rows.forEach((cells, idx) => {
    const row = firstRow + idx;
    if (cells.every((c) => !String(c ?? '').trim())) return; // blank line
    if (isSample(cells)) return; // example rows from the sample
    total++;
    const r = Object.fromEntries(COLUMNS.map((c, i) => [c, String(cells[i] ?? '').trim()])) as RawRow;
    const rowErrors: StockRowError[] = [];
    const err = (column: Column, message: string, fix: string) => rowErrors.push({ row, column, message, fix });

    if (!ctx.locations.has(r.location_id)) err('location_id', `Unknown location "${r.location_id}"`, 'Use WH-KOL or a store code like LKO-01, or add the store first (Add store).');
    const m = SKU.exec(r.sku_id);
    let newItem: CatalogItem | null = null;
    if (!m) err('sku_id', `"${r.sku_id}" is not a product code`, 'Write it as STYLE-NN-SIZE, e.g. KUR-12-XL.');
    else if (!allowNewItems && !ctx.items.has(r.sku_id))
      // Type-it-in form: it has no name, category, size or price fields, so it cannot create a product.
      err('sku_id', `Unknown product code "${r.sku_id}"`, 'New products can only be added with a file, which carries the name, category, size and price.');
    else {
      if (m[2] !== r.size) err('size', `Size "${r.size}" does not match the code's size "${m[2]}"`, `Set size to ${m[2]} or fix the product code.`);
      const known = ctx.items.get(r.sku_id);
      if (known) {
        if (!same(known.style_name, r.style_name)) err('style_name', `Name "${r.style_name}" differs from the catalogue`, `Use "${known.style_name}".`);
        if (!same(known.category, r.category)) err('category', `Category "${r.category}" differs from the catalogue`, `Use "${known.category}".`);
        if (Number(r.mrp_inr) !== known.mrp) err('mrp_inr', `MRP ${r.mrp_inr || '(blank)'} differs from the catalogue`, `Use ${known.mrp}.`);
      } else {
        if (!r.style_name) err('style_name', 'New product needs a name', 'Fill in the style name.');
        const cat = CATEGORIES.find((c) => same(c, r.category));
        if (!cat) err('category', `"${r.category}" is not a category`, `Use one of: ${CATEGORIES.join(', ')}.`);
        const mrp = Number(r.mrp_inr);
        if (!Number.isInteger(mrp) || mrp <= 0) err('mrp_inr', `MRP "${r.mrp_inr}" is not a whole rupee amount`, 'Write the tag price in rupees, e.g. 6799.');
        if (r.style_name && cat && Number.isInteger(mrp) && mrp > 0)
          newItem = { sku_id: r.sku_id, style_id: m[1], style_name: r.style_name, category: cat, size: m[2], mrp };
      }
    }
    const qty = Number(r.qty);
    if (!/^\d+$/.test(r.qty) || qty < 1 || qty > MAX_QTY) err('qty', `Pieces "${r.qty}" is not a whole number from 1 to ${MAX_QTY.toLocaleString('en-IN')}`, 'Write the number of pieces, e.g. 12.');
    if (!DATE.test(r.received_on) || Number.isNaN(Date.parse(r.received_on + 'T00:00:00Z')) || addDays(r.received_on, 0) !== r.received_on)
      err('received_on', `Date "${r.received_on}" is not YYYY-MM-DD`, 'Write the date like 2026-11-02.');
    else if (r.received_on <= ctx.asOf) err('received_on', `Received on or before ${human(ctx.asOf)}: already in the stock count`, 'Use a date after it.');
    else if (r.received_on > ctx.today) err('received_on', `Date ${r.received_on} is after today (${human(ctx.today)})`, `Use a date from ${human(addDays(ctx.asOf, 1))} to ${human(ctx.today)}.`);
    else if (r.received_on < addDays(ctx.today, -MAX_AGE_DAYS)) err('received_on', `Date ${r.received_on} is more than ${MAX_AGE_DAYS} days ago`, 'Older stock is already in the count; leave it out.');

    if (rowErrors.length) {
      errors.push(...rowErrors);
      failed.push({ row, values: COLUMNS.map((c) => r[c]), error: rowErrors.map((e) => `${e.column}: ${e.message}. ${e.fix}`).join(' | ') });
    } else {
      good.push({ row, location_id: r.location_id, sku_id: r.sku_id, qty, received_on: r.received_on, newItem });
    }
  });

  // Duplicates (same location + SKU + date) are summed and shown as one.
  const merged = new Map<string, GoodRow>();
  for (const g of good) {
    const k = `${g.location_id}|${g.sku_id}|${g.received_on}`;
    const prev = merged.get(k);
    if (prev) {
      prev.qty += g.qty;
      warnings.push({ row: g.row, column: 'sku_id', message: `Same location, product and date as row ${prev.row}; pieces added together`, fix: 'Nothing to do unless this was a mistake.' });
    } else merged.set(k, { ...g });
  }
  const goodMerged = [...merged.values()];

  const byLoc = new Map<string, { pieces: number; rows: number }>();
  for (const g of goodMerged) {
    const b = byLoc.get(g.location_id) ?? { pieces: 0, rows: 0 };
    b.pieces += g.qty; b.rows++;
    byLoc.set(g.location_id, b);
  }
  const by_location = [...byLoc.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([location_id, b]) => {
    const loc = ctx.locations.get(location_id)!;
    const over = loc.capacity != null && loc.stock_now + b.pieces > loc.capacity;
    if (over) warnings.push({ row: 0, column: 'location_id', message: `${location_id} would hold ${loc.stock_now + b.pieces} of ${loc.capacity} spaces`, fix: 'You can still add it; the next run will pull back slow stock.' });
    return { location_id, pieces: b.pieces, rows: b.rows, over_capacity: over };
  });
  return { rows_total: total, good: goodMerged, failed, errors, warnings, by_location };
}

/** Minimal CSV reader (quotes, commas, CRLF). */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); out.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}

export const csvLine = (cells: (string | number)[]) =>
  cells.map((c) => { const s = String(c); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',');
