// Add stock API shapes (#23, apps/api/src/stock). Result shapes come from the contract.
export type { StockCheckResult, StockCommitResult, StockRowError } from '@sm/contract';

/** The 8 columns of the sample file, in order. The server refuses any other header (422). */
export const STOCK_COLUMNS = [
  'location_id', 'sku_id', 'style_name', 'size', 'category', 'mrp_inr', 'qty', 'received_on',
] as const;

/** Upload limit shown to the user (same as MAX_ROWS in apps/api/src/stock/check.ts). */
export const MAX_ROWS = 5000;

/** Error bodies from the stock API: `{ error }` (Nest's own errors use `message`). */
export type StockErrorBody = { error?: string; message?: string | string[]; statusCode?: number };

/** Plain-word name of each column. */
export const COLUMN_LABELS: Record<string, string> = {
  location_id: 'Where it arrived', sku_id: 'Product code', style_name: 'Product name', size: 'Size',
  category: 'Category', mrp_inr: 'Tag price', qty: 'Pieces', received_on: 'Date received',
};

/** "Column 7, Pieces" for an API column key; the key itself if unknown. */
export function columnName(column: string): string {
  const i = (STOCK_COLUMNS as readonly string[]).indexOf(column);
  return i < 0 ? column : `Column ${i + 1}, ${COLUMN_LABELS[column]}`;
}

/** Joins an API message and its fix with exactly one full stop between them. */
export function sentence(message: string, fix?: string): string {
  const m = message.trim();
  const stopped = /[.!?]$/.test(m) ? m : `${m}.`;
  return fix ? `${stopped} ${fix.trim()}` : stopped;
}

/** True when a YYYY-MM-DD date is on or before the stock count date (run.as_of): probably already counted. */
export function beforeCount(receivedOn: string, asOf: string): boolean {
  const d = receivedOn.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= asOf;
}

/** POST /api/stock/check-row body (type-it-in form). Name, size, category and price are filled from the catalogue. */
export type StockRowInput = { location_id: string; sku_id: string; qty: number; received_on: string };
