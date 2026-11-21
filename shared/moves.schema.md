# moves.json — the contract between engine and UI

Engine writes it, UI reads it. Sample: `moves.sample.json` (made-up numbers, real shape).
Changing a field name? Tell the other person and update both files.

```ts
type Side = {            // one end of a move, before or after
  on_hand: number;
  in_transit: number;
  velocity: number;      // units/day, forward-looking; 0 for warehouse
  cover_days: number | null;   // null = no sales / warehouse
};

type Move = {
  id: string;                       // "M0001"
  type: "WH_TO_STORE" | "STORE_TO_STORE" | "PULL_BACK";
  trigger: "LOW_COVER" | "STOCKOUT" | "UNDER_STOCKED" | "MIN_DISPLAY" | "AGEING" | "OVER_CAPACITY";
  sku_id: string; style_id: string; style_name: string;
  category: string; size: string; mrp: number;
  from: string; to: string;         // store_id or "WH-KOL"
  qty: number;
  lead_time_days: number; arrives_on: string;   // ISO date
  reason: string;                   // the one line, ready to show
  from_before: Side; from_after: Side;
  to_before: Side;   to_after: Side;
  priority: number;                 // higher = more urgent, UI sorts desc
  value_inr: number;                // qty × mrp
  velocity_basis: "own" | "blended" | "peer";   // drives the confidence dot
  stock_age_days: number | null;    // at source
  checks: {                         // all true or the move is not in the file
    min_display: boolean; capacity: boolean; flagship: boolean;
    in_transit: boolean; donor_cover_30: boolean;
  };
};

type Flag = {                       // found a problem, deliberately no move
  kind: "WAIT_FOR_INBOUND" | "BLOCKED_FLAGSHIP" | "BLOCKED_DONOR_COVER" | "COVERED_BY_TRANSIT" | "NO_SOURCE";
  store_id: string; sku_id: string; note: string;
};

type MovesFile = {
  run: { as_of: string; generated_at: string; next_run_at: string; engine_version: string };
  summary: {
    moves: number; units: number; value_inr: number;
    by_type: Record<Move["type"], number>;
    stores_at_risk: number; violations: number;   // violations must be 0
    found: Record<string, number>;   // hidden-problem counts, e.g. { stockout_masked_demand: 7 }
  };
  moves: Move[];
  flags: Flag[];
};
```

Per-row chart data (12 weeks of sales + stock) is a separate file so moves.json stays small:
`history.json` → `{ "<store_id>|<sku_id>": [{ week_ending, units_sold, closing_on_hand, days_in_stock }] }`
