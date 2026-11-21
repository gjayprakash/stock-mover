// Add stock API shapes (#23). #23 is not merged yet: these follow the issue text.
// When `packages/contract` gains StockCheckResult / StockCommitResult, swap these for imports.

/** The 8 columns of the sample file, in order. The server refuses any other header. */
export const STOCK_COLUMNS = [
  'location_id', 'sku_id', 'style_name', 'size', 'category', 'mrp_inr', 'qty', 'received_on',
] as const;
export type StockColumn = (typeof STOCK_COLUMNS)[number];

/** Upload limit shown to the user (issue #23: ≤ 5,000 rows). */
export const MAX_ROWS = 5000;

export type StockRowError = { row: number; column: string; message: string; fix: string };

/** POST /api/stock/check (multipart `file`) and POST /api/stock/check-row → 200. */
export type StockCheckResult = {
  check_id: string;
  file_hash?: string;
  rows_total: number;
  ok_rows: number;
  pieces: number;
  by_location: { location_id: string; pieces: number; rows: number; over_capacity: boolean }[];
  errors: StockRowError[];
  warnings?: { row?: number; column?: string; message: string }[];
};

/** POST /api/stock/check with a wrong header → 422 { message } naming the first wrong column. */
export type StockRefused = { message: string | string[]; column?: string };

/** POST /api/stock/commit { check_id } → 200. Same file twice → 409. */
export type StockCommitResult = { rows_added?: number; pieces_added?: number };

/** POST /api/stock/check-row body (type-it-in form). */
export type StockRowInput = { location_id: string; sku_id: string; qty: number; received_on: string };
