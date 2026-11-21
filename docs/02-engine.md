# Engine spec (pure TypeScript, deterministic, `apps/api/src/engine/`)

Pipeline: `prepare → velocity → needs/surplus → moves → validate → moves.json`

Exclude `is_packaging = 1` everywhere. Grain is store × SKU (style + size).

## 1. Velocity (the part judges care about most)
Window: last 12 weeks (matches `stock_weekly`).

- `units_12w` = units sold per store × SKU in the window (bill_lines ⨝ bills).
- `instock_days` = sum of `days_in_stock` over the 12 weeks.
- **Own rate** = `units_12w / instock_days` (per in-stock day, NOT per calendar day).
- **Prior rate** = what this SKU "should" sell here when we cannot trust own data:
  network rate for the SKU (all stores, per in-stock day) × store's category index
  (store's share of category sales ÷ average store's share).
- **Blended velocity** = `(units_12w + K × prior) / (instock_days + K)`, K = 14.
  Lots of in-stock days → own data wins. Few or none → prior wins.
- `velocity_basis`: `own` (instock_days ≥ 42), `blended` (14–41), `peer` (< 14).

This single formula handles the traps:
- Zero sales because it was out of stock → instock_days ≈ 0 → uses prior → real demand shows up.
- Zero sales while in stock all 84 days → velocity ≈ 0 → genuinely slow → ageing/pull-back candidate.
- Brand-new store → few in-stock days → prior. Newly launched style → same.

**Forward uplift (do only after v1 works):** multiplier per state × category =
last year's daily rate in the next 30 days ÷ last year's daily rate in the preceding
12 weeks. Clamp 0.6–2.5. `forward_velocity = velocity × uplift`. This is how the
festival/wedding calendar gets used without building a forecast model.

## 2. Position per store × SKU
- `available = on_hand + in_transit` (rule 3: in-transit counts).
- `cover_days = available / forward_velocity` (∞ if velocity 0).
- `target_units = ceil(forward_velocity × TARGET_COVER)`, TARGET_COVER = 45 days unless `rules` says otherwise.
- `need = max(0, target_units − available)`.
- `surplus = max(0, on_hand − ceil(forward_velocity × DONOR_KEEP))`, DONOR_KEEP = 60 days (must stay ≥ 30 by rule 4; we keep a margin).
- `stock_age_days = as_of − oldest_stock_received_on`.
- Category level: `cat_units(store, category)` vs `min_display(tier, category)`; `store_units` vs `stock_capacity_units`.
- `lost_sales_12w = velocity × (84 − instock_days)` → the "would sell more if it held more" signal.

## 3. Generate moves, in this order
**A. Warehouse → store** (cheapest fix, do first)
- For each SKU with needs: if WH on_hand ≥ total need, fill everyone.
- If short: give one unit at a time to the store with the lowest cover after counting what it already got. Ties → higher velocity, then higher tier. This is fair-share allocation and is easy to explain.
- Also top up any store below min display for a category (pick that category's best sellers there).
- If WH is empty but `warehouse_inbound` lands within the store's stockout date, raise a flag ("wait for inbound"), not a store → store move.

**B. Store → store** (only for need the warehouse could not cover)
- Donor must have surplus, must not be S++ with that style in `flagship_protected`,
  must keep ≥ 30 days cover after the move, and its category must stay ≥ min display.
- Pick the donor with the highest cover; prefer same city / shortest lead time.
- Skip if lead time > days until the receiver would have sold out anyway and the need is tiny (< 2 units).

**C. Ageing stock**
- Candidate: `stock_age_days ≥ 90` AND `cover_days ≥ 120` (or velocity 0 with real in-stock days). Fashion styles (`is_core_style = 0`) first, they expire.
- Send to the store with the best velocity for that SKU that still has room and need (trigger = AGEING).
- No store wants it → **pull back** to WH-KOL (type = PULL_BACK), unless that breaks min display.

**D. Capacity guard**: before adding any inbound move, `store_units + in_transit + already_planned_in ≤ stock_capacity_units`. Overfull stores also generate pull-backs of their slowest stock.

## 4. Validator (separate function, runs on the final list, trusts nothing)
Recompute from raw position and assert for every move and every store after all moves:
1. min display kept per store × category  2. capacity not exceeded
3. no protected style leaves an S++ store  4. in-transit counted, no SKU sent to a store that already has enough arriving
5. donor cover ≥ 30 days after store → store  6. qty ≤ what the source actually has (sum across moves)
7. arrival date = today + lead time, reason line present.
Any failing move is dropped and logged. UI shows "Rule check: N moves, 0 violations".

## 5. Reason line templates (numbers filled in, max ~110 chars)
- WH→store: `Sells 0.4/day, 3 left = 7 days cover; +12 from WH takes it to 37 days (arrives 4 Nov).`
- Stockout: `Out of stock 21 of last 84 days but sells 0.5/day when available; restock 15.`
- Store→store: `LKO-02 holds 140 days cover, BLR-01 has 6; moving 8 leaves LKO-02 at 62 days.`
- Ageing: `In PAT-03 for 132 days, 1 sold in 12 wks; sells 0.3/day in PAT-01. Move 6.`
- Pull back: `No store sells this size; 9 units, 150 days old, free up display space.`

## 6. Priority score (sort order in UI)
`priority = units_at_risk × mrp`, where units_at_risk = sales lost before a normal
replenishment would arrive. Ageing moves score on `qty × mrp × age factor`.

## 7. Hidden-problem checklist (verify each exists in our output before demo)
- [ ] A fast seller showing zero recent sales because it stocked out
- [ ] One size of a style sold out while other sizes sit (size-level, "right size")
- [ ] The brand-new store with no history, under-stocked
- [ ] Fashion (non-core) style ageing in a slow store while selling elsewhere
- [ ] A store that looks short but has stock in transit (must NOT get a move)
- [ ] An S++ flagship that looks like a great donor for a protected style (must NOT donate)
- [ ] A donor that would drop under 30 days cover (move must be reduced or blocked)
- [ ] Warehouse short on a hot SKU, several stores competing
- [ ] A store at or over capacity
- [ ] State-specific festival coming (demand about to jump in one state only)
- [ ] A category under min display
- [ ] Packaging rows ignored

## Tunables (keep in one `params.ts`)
WINDOW_DAYS 84 · K 14 · TARGET_COVER 45 · DONOR_KEEP 60 · MIN_DONOR_COVER 30 · AGE_DAYS 90 · AGE_COVER 120
