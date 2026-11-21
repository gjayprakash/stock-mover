// DEV ONLY. A stand-in for the #23 Add stock API so every screen state can be walked in the browser
// before the real endpoints exist. api.ts only imports this behind `import.meta.env.DEV`, so it is
// left out of the production bundle. Delete once #23 is live.
import { parseCsv, saveText, toCsvLine } from './csvParse';
import { STOCK_COLUMNS, type StockCheckResult, type StockRowError, type StockRowInput } from './types';
import type { FakeCtx } from './api';

const pending = new Map<string, { result: StockCheckResult; hash: string; bad: { cells: string[]; error: string }[] }>();
const committedHashes = new Set<string>();

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

function catalogue(ctx: FakeCtx) {
  const map = new Map<string, { style_name: string; size: string; category: string; mrp: number }>();
  for (const m of ctx.moves) map.set(m.sku_id, { style_name: m.style_name, size: m.size, category: m.category, mrp: m.mrp });
  return map;
}

export function fakeSampleCsv(ctx: FakeCtx): string {
  const skus = [...catalogue(ctx).entries()].slice(0, 3);
  const stores = ctx.stores.map((s) => s.store_id);
  const rows = skus.map(([sku, c], i) =>
    toCsvLine([i === 1 && stores[0] ? stores[0] : 'WH-KOL', sku, c.style_name, c.size, c.category, c.mrp, (i + 1) * 4, ctx.today]),
  );
  return [STOCK_COLUMNS.join(','), ...rows].join('\n') + '\n';
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function checkRows(ctx: FakeCtx, rows: string[][], firstRowNo: number, sampleLines: Set<string>, text: string): StockCheckResult {
  const cat = catalogue(ctx);
  const known = new Map(ctx.stores.map((s) => [s.store_id, s]));
  const errors: StockRowError[] = [];
  const bad: { cells: string[]; error: string }[] = [];
  const byLoc = new Map<string, { pieces: number; rows: number }>();
  let total = 0;
  rows.forEach((cells, i) => {
    const rowNo = firstRowNo + i;
    if (sampleLines.has(toCsvLine(cells))) return; // example rows left in are ignored
    total++;
    const [loc, sku, name, size, category, mrp, qtyRaw, date] = cells.map((c) => (c ?? '').trim());
    const err = (column: string, message: string, fix: string) => ({ row: rowNo, column, message, fix });
    let e: StockRowError | null = null;
    const m = /^([A-Z]{3}-\d{2})-([A-Z]+)$/.exec(sku);
    const n = Number(qtyRaw);
    const age = /^\d{4}-\d{2}-\d{2}$/.test(date) ? daysBetween(date, ctx.today) : NaN;
    if (loc !== 'WH-KOL' && !known.has(loc)) e = err('location_id', `Store ${loc || '(blank)'} is not in your store list.`, `Check the code, or add ${loc || 'the store'} as a new store first.`);
    else if (!m) e = err('sku_id', `Product code ${sku || '(blank)'} is not in the right shape.`, 'Write it as style, number and size joined by dashes, in column 2.');
    else if (m[2] !== size) e = err('size', `Size ${size || '(blank)'} does not match the product code ${sku}.`, `Write ${m[2]} in column 4.`);
    else if (!cat.has(sku) && (!name || !category || !mrp)) e = err('style_name', `${sku} is a new product, so its name, category and tag price are needed.`, 'Fill in columns 3, 5 and 6.');
    else if (!Number.isInteger(n) || n < 1 || n > 10000) e = err('qty', `Pieces says "${qtyRaw}". It must be a whole number from 1 to 10,000.`, 'Type the number of pieces in column 7.');
    else if (Number.isNaN(age)) e = err('received_on', `Date ${date || '(blank)'} is in the wrong format.`, 'Write it as year-month-day in column 8.');
    else if (age < 0) e = err('received_on', `Date ${date} is in the future.`, 'Use the day the pieces actually arrived.');
    else if (age > 60) e = err('received_on', `Date ${date} is more than 60 days ago.`, 'Only stock received in the last 60 days can be added here.');
    if (e) { errors.push(e); bad.push({ cells, error: `${e.message} ${e.fix}` }); return; }
    const cur = byLoc.get(loc) ?? { pieces: 0, rows: 0 };
    byLoc.set(loc, { pieces: cur.pieces + n, rows: cur.rows + 1 });
  });
  const by_location = [...byLoc.entries()]
    .map(([location_id, v]) => {
      const s = known.get(location_id);
      return { location_id, ...v, over_capacity: !!s && s.stock_now + v.pieces > s.capacity };
    })
    .sort((a, b) => b.pieces - a.pieces);
  const result: StockCheckResult = {
    check_id: `fake-${hash(text)}-${Date.now()}`,
    file_hash: hash(text),
    rows_total: total,
    ok_rows: total - errors.length,
    pieces: by_location.reduce((s, l) => s + l.pieces, 0),
    by_location,
    errors,
    warnings: [],
    new_skus: [],
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
  };
  pending.set(result.check_id, { result, hash: result.file_hash!, bad });
  return result;
}

export type FakeCheck = { status: 200; body: StockCheckResult } | { status: 422; body: { message: string } };

export async function fakeCheckFile(ctx: FakeCtx, file: File): Promise<FakeCheck> {
  await new Promise((r) => setTimeout(r, 700));
  if (!/\.csv$/i.test(file.name)) return { status: 422, body: { message: 'The test version reads CSV files only. Save the sheet as CSV and upload again.' } };
  const text = await file.text();
  const [header = [], ...rows] = parseCsv(text);
  const wrong = STOCK_COLUMNS.findIndex((c, i) => (header[i] ?? '').trim() !== c);
  if (wrong >= 0 || header.length !== STOCK_COLUMNS.length) {
    const i = wrong >= 0 ? wrong : STOCK_COLUMNS.length;
    const msg = i < STOCK_COLUMNS.length
      ? `Column ${i + 1} should be "${STOCK_COLUMNS[i]}" but the file has "${(header[i] ?? '').trim() || 'nothing'}".`
      : `The file has ${header.length} columns. It should have exactly ${STOCK_COLUMNS.length}.`;
    return { status: 422, body: { message: msg } };
  }
  const sampleLines = new Set(parseCsv(fakeSampleCsv(ctx)).slice(1).map(toCsvLine));
  return { status: 200, body: checkRows(ctx, rows, 2, sampleLines, text) };
}

export async function fakeCheckRow(ctx: FakeCtx, input: StockRowInput): Promise<StockCheckResult> {
  await new Promise((r) => setTimeout(r, 300));
  const c = catalogue(ctx).get(input.sku_id);
  const size = /-([A-Z]+)$/.exec(input.sku_id)?.[1] ?? '';
  const cells = [input.location_id, input.sku_id, c?.style_name ?? '', c?.size ?? size, c?.category ?? '', String(c?.mrp ?? ''), String(input.qty), input.received_on];
  return checkRows(ctx, [cells], 1, new Set(), `${JSON.stringify(input)}-${Date.now()}`);
}

export async function fakeCommit(checkId: string): Promise<{ status: number; body: { receipts?: number; pieces?: number; error?: string } }> {
  await new Promise((r) => setTimeout(r, 500));
  const p = pending.get(checkId);
  if (!p) return { status: 404, body: { error: 'This check has expired. Upload the file again.' } };
  if (committedHashes.has(p.hash)) return { status: 409, body: { error: 'This file was already added.' } };
  committedHashes.add(p.hash);
  return { status: 200, body: { receipts: p.result.ok_rows, pieces: p.result.pieces } };
}

export function fakeDownloadErrors(checkId: string) {
  const p = pending.get(checkId);
  if (!p) return;
  saveText('rows-to-fix.csv', [toCsvLine([...STOCK_COLUMNS, 'error']), ...p.bad.map((b) => toCsvLine([...b.cells, b.error]))].join('\n') + '\n');
}
