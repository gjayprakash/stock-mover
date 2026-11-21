// @sm/contract — shared shapes between engine (apps/api/src/engine), API and UI.
// Types only: import with `import type { ... } from '@sm/contract'`. Nothing is emitted.
// Changing a field? Tell the other lanes and update moves.sample.json / history.sample.json.

export type MoveType = "WH_TO_STORE" | "STORE_TO_STORE" | "PULL_BACK";
export type MoveTrigger = "LOW_COVER" | "STOCKOUT" | "UNDER_STOCKED" | "MIN_DISPLAY" | "AGEING" | "OVER_CAPACITY";
export type RunStatus = "FINISHED" | "FAILED" | "RUNNING";

/** One end of a move, before or after. */
export type Side = {
  on_hand: number;
  in_transit: number;
  velocity: number;            // units/day, forward-looking; 0 for warehouse
  cover_days: number | null;   // null = no sales / warehouse
};

export type Move = {
  id: string;                  // "M0001"
  type: MoveType;              // ageing re-homes are STORE_TO_STORE + trigger "AGEING"
  trigger: MoveTrigger;
  sku_id: string; style_id: string; style_name: string;
  category: string; size: string; mrp: number;
  from: string; to: string;    // store_id or "WH-KOL"
  qty: number;
  lead_time_days: number; arrives_on: string;   // ISO date
  reason: string;              // the one line, ready to show (template with real numbers)
  from_before: Side; from_after: Side;
  to_before: Side; to_after: Side;
  priority: number;            // higher = more urgent, UI sorts desc
  value_inr: number;           // qty × mrp
  needs_signoff: boolean;      // value_inr > 100000 (rules.csv "Approval")
  velocity_basis: "own" | "blended" | "peer";   // drives the confidence dot
  stock_age_days: number | null;                // at source
  checks: {                    // all true or the move is not in the file
    min_display: boolean; capacity: boolean; flagship: boolean;
    in_transit: boolean; donor_cover_30: boolean;
  };
  // #25 nearest store first. Store → store only; null / [] for warehouse moves and pull-backs.
  distance_km: number | null;  // road km (straight line × 1.3 until a routing service is wired)
  travel_days: number | null;  // lead_times tab for the route (same city / same zone / other zone); equals lead_time_days
  alternatives: { store_id: string; distance_km: number; travel_days: number }[];   // other candidate receivers, closest first, max 5
};

/** Found a problem, deliberately no move. */
export type Flag = {
  kind: "WAIT_FOR_INBOUND" | "BLOCKED_FLAGSHIP" | "BLOCKED_DONOR_COVER" | "COVERED_BY_TRANSIT" | "NO_SOURCE" | "DATA_COUNT_MISMATCH";
  store_id: string; sku_id: string; note: string;
};

export type ProblemKind =
  | "STARVED_BESTSELLER" | "DATA_FLAG" | "UNDER_STOCKED_STORE" | "NEW_STORE"
  | "TRULY_SLOW" | "LAUNCH_RAMP" | "OVER_CAPACITY";

export type Problem = {
  id: string; kind: ProblemKind;
  rank: number; tag: string; title: string; seen: string; fix: string;   // all template text with real numbers
  subject: { style_id?: string; store_id?: string; sku_id?: string };
  move_ids: string[]; impact_inr: number; needs_signoff_count: number;
  chart?: { label: string; weeks: string[]; series: { name: string; values: number[] }[] };
};

export type StoreSummary = {
  store_id: string; city: string; zone: string; tier: string; capacity: number; opened_on: string;
  stock_now: number; stock_after: number; in_units: number; out_units: number;
  low_cover_skus: number; sold_out_with_demand: number; at_risk_week_inr: number;
  categories: { category: string; min_display: number; now: number; incoming: number; outgoing: number }[];
  status: "TOO_FULL" | "RUNNING_EMPTY" | "NORMAL";
};

/** How many candidate moves each rule blocked. */
export type Blocked = { donor_cover_30: number; flagship: number; min_display: number; capacity: number; in_transit: number };

export type MovesFile = {
  run: {
    run_id: string; status: RunStatus;
    as_of: string; generated_at: string; next_run_at: string; engine_version: string;
  };
  summary: {
    moves: number; units: number; value_inr: number;
    by_type: Record<MoveType, number>;
    stores_at_risk: number; violations: number;   // violations must be 0
    found: Record<string, number>;               // hidden-problem counts, e.g. { stockout_masked_demand: 7 }
  };
  moves: Move[];
  flags: Flag[];
  problems: Problem[];
  stores: StoreSummary[];
  blocked: Blocked;
};

export type HistoryPoint = { week_ending: string; units_sold: number; closing_on_hand: number; days_in_stock: number };
/** Keyed by "STORE_ID|SKU_ID". Per-row chart data, kept out of moves.json so it stays small. */
export type HistoryFile = Record<string, HistoryPoint[]>;

export type RunRow = {
  run_id: string; as_of: string; started_at: string; finished_at: string | null;
  status: RunStatus; trigger: "cron" | "boot" | "manual";
  moves: number; violations: number; error?: string;
};

export type AiCall = {
  id: string; run_id: string; at: string; job: "BRIEF" | "ASK" | "DATA_FLAG"; input_summary: string; output: string;
  numbers_found: number; numbers_total: number; result: "SHOWN" | "HELD_BACK" | "ERROR";
  held_reason?: "UNGROUNDED_NUMBER" | "FORECAST_REQUEST" | "OUT_OF_SCOPE" | "MODEL_ERROR";
  model: string; tokens_in?: number; tokens_out?: number; latency_ms: number;
};

export type BriefResponse = { text: string; numbers_found: number; numbers_total: number; generated_at: string; source: "AI" | "TEMPLATE" };

// ---- Add store (#21) ----
export type NewStoreRequest = {
  store_id: string; city: string; tier: "S++" | "S+" | "A" | "B"; capacity: number; opened_on: string;
  pin: string; address: string; lat: number; lng: number;
};
/** GET /api/geo?pin= ; zone null = state outside North/East/South (pick by hand). */
export type GeoResult = { pin: string; place: string; city: string; state: string; zone: string | null; lat: number; lng: number };
export type NearestLocation = { location_id: string; city: string; distance_km: number; travel_days: number };

// #23 Add stock. Sample columns, in this order: location_id, sku_id, style_name, size, category, mrp_inr, qty, received_on.
export type StockRowError = { row: number; column: string; message: string; fix: string };   // row = line in the file (header = 1); 0 = whole location
export type StockCheckResult = {
  check_id: string; file_hash: string; expires_at: string;   // kept 30 min, nothing saved yet
  rows_total: number; ok_rows: number; pieces: number;       // example rows from the sample are not counted
  by_location: { location_id: string; pieces: number; rows: number; over_capacity: boolean }[];
  errors: StockRowError[];
  warnings: StockRowError[];                                 // over capacity, duplicate rows summed
  new_skus: string[];                                        // SKUs that will be created on commit
};
export type StockCommitResult = { receipts: number; pieces: number; items_added: number; applies_from: "next run" };

// ---- Roles and sign-in (#76) ----
export type Role = "super_admin" | "store_manager";
/** GET /api/me (plus `enabled: true`), and `req.user` on the API. location_id is null only for the super admin. */
export type Me = { id: string; name: string; email: string; role: Role; location_id: string | null };
/** GET /api/users (super admin only). */
export type UserRow = Me & {
  mobile: string | null; status: "Active" | "Invite sent" | "Turned off";
  last_sign_in_at: string | null; created_at: string;
};
