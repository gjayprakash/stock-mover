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

/** POST /api/stock/check-row body (type-it-in form). Name, size, category and price are filled from the catalogue. */
export type StockRowInput = { location_id: string; sku_id: string; qty: number; received_on: string };
