# Stock Mover: team knowledge base

Single source of context for the team and for Claude. Self-contained: you do not need the repo open to use it.
Repo: https://github.com/gjayprakash/stock-mover (public). The raw workbook is **not** in the repo.

---

## 1. The project in one minute

**Client:** Vedant Fashions (Manyavar), Indian ethnic menswear. **Event:** AI Hackathon, Case study B, "Stock Mover".

**Problem:** stock sits in the wrong place. One store is out of a hot kurta size while another holds 140 days of it; the warehouse is short and several stores compete; fashion styles age in slow stores.

**What we ship:** a tool that runs **every day on its own**, looks at 20 stores + 1 warehouse (`WH-KOL`), and produces a **ready-to-approve move list**:
- Warehouse → store (what to send, to whom, fair share when short)
- Store → store (from where it sits to where it sells)
- Pull back to warehouse (ageing or dead stock, overfull stores)

Each move has a **one-line reason with real numbers**. A merchandiser must be able to approve the whole list in **10 minutes**, and the output has **zero rule violations**.

**Constraints:** 4 hours total, then it must be live on Vercel. MVP only.

---

## 2. Team and ownership

| Person | Owns | Day-of focus |
|---|---|---|
| Jay | Data + engine + cron | `scripts/prepare`, `lib/engine/*`, validator, `/api/run`, Vercel Cron |
| Asjad | UI + MeshAPI | Next.js screens, approve/export, morning brief, chat drawer |

Swap freely, but update `TASKS.md`. Any decision the other person needs → one line in the **Decision log** in `CLAUDE.md`.

---

## 3. How we are judged (optimise for exactly this)

1. **Hidden problems found.** The organisers planted stock problems in the data and check whether our output catches them (checklist in §9).
2. **Numbers spot-checked.** They will pick moves and recompute them. Every number must be traceable.
3. **No rule broken.** Any violation is fatal. A validator re-checks every move.
4. **Runs on its own.** Scheduled daily run, no button pushing. UI shows last run and next run.
5. **"Zero sales isn't always a slow product."** Velocity must be per in-stock day.

---

## 4. The five rules (never break)

| # | Rule | How the engine enforces it |
|---|---|---|
| 1 | Every store keeps minimum display per category (`min_display` tab) and never exceeds `stock_capacity_units` | Category units after moves ≥ min display; store units + in transit + planned in ≤ capacity |
| 2 | S++ flagships never give away their top-20 styles (`flagship_protected` tab) | Protected style at S++ store is never a donor. Logged as `BLOCKED_FLAGSHIP` flag |
| 3 | In-transit stock counts as arriving; never send it twice | `available = on_hand + in_transit`. Store covered by transit gets a `COVERED_BY_TRANSIT` flag, no move |
| 4 | No store → store move may leave the giver under 30 days of cover | Donor keeps ≥ 60 days by design (margin); validator asserts ≥ 30 |
| 5 | Ignore transport cost, respect lead times (`lead_times` tab); every move has a one-line reason | `arrives_on = today + lead_time`; reason from templates |

---

## 5. Architecture (decided, do not reopen)

```
Excel workbook ──► scripts/prepare ──► data/derived/*.json (small)
                                            │
                                            ▼
                              lib/engine (pure TypeScript)
          velocity → position → moves (WH→store, store→store, ageing, capacity) → validator
                                            │
                                            ▼
                             moves.json  (+ history.json for charts)
                                            │
           ┌────────────────────────────────┼─────────────────────────────┐
           ▼                                ▼                             ▼
   Next.js UI (reads only           /api/brief (MeshAPI)          /api/chat (MeshAPI)
   moves.json)                      morning brief                 "Ask Stock Mover"

   Vercel Cron ──► /api/run (daily 06:00 IST) regenerates moves.json
```

- **One Next.js app** (App Router, TypeScript, Tailwind, shadcn/ui, Recharts) on **Vercel**. No separate backend, no database.
- **Approvals** live in the browser (localStorage) + "Export approved CSV". No auth, no users.
- **AI** goes through **MeshAPI** only, for exactly two features: morning brief and grounded chat.

### Repo layout
```
CLAUDE.md                 shared context, loaded by Claude Code automatically
TASKS.md                  live checklist with owners
docs/01-brief.md          condensed brief + data dictionary
docs/02-engine.md         engine spec
docs/03-ui.md             UI spec
docs/04-meshapi.md        AI wiring
docs/05-plan.md           4-hour plan, cut order, demo script
shared/moves.schema.md    engine ↔ UI contract
shared/moves.sample.json  sample with the real shape
data/                     workbook goes here (gitignored)
data/derived/             output of scripts/prepare
lib/engine/               engine (to build)
```

---

## 6. Data

One Excel workbook (CSV copy available). Synthetic and scaled down.
**As-of:** close of **2026-10-31**. **Today in the product:** 2026-11-01. Sales history 1 Nov 2024 → 31 Oct 2026.
6 cities, 3 states. Zones: North = Uttar Pradesh, East = Bihar, South = Karnataka.

### Tabs we use

| Tab | One row is | Rows | Key columns |
|---|---|---|---|
| `stores` | store | 20 | store_id, city, state, zone, tier (S++, S+, A, B), size_sqft, stock_capacity_units, opened_on (one store is brand new), area_manager_id |
| `items` | SKU (style + size) | 385 | sku_id, style_id, style_name, category, size, mrp, cost_price, launch_date, is_core_style (1 = all-year, 0 = limited fashion run), is_packaging (1 = bag/box, ₹0) |
| `bills` | bill | 90,805 | bill_id, bill_date, store_id, salesperson_id, customer_id |
| `bill_lines` | item on a bill | 259,772 | bill_id, sku_id, qty, mrp, selling_price |
| `stock_snapshot` | location × SKU | 3,547 | as_of_date, location_id (store or WH-KOL), sku_id, on_hand, in_transit, in_transit_arrives_on, oldest_stock_received_on |
| `stock_weekly` | store × SKU × week | 61,416 | week_ending (15 Aug – 31 Oct 2026, Sun–Sat), store_id, sku_id, closing_on_hand, days_in_stock (0–7) |
| `warehouse_inbound` | delivery | 768 | expected_date (from 1 Nov 2026), sku_id, qty, status |
| `calendar` | date × state | 2,373 | date, state, festival, is_wedding_date (Nov 2024 – Dec 2026) |
| `rules` | setting | — | stock rules (column names: open question) |
| `min_display` | tier × category | — | e.g. S++ · Kurta Set · 120 |
| `lead_times` | route | — | days a move takes |
| `flagship_protected` | store × rank | — | store_id, rank, style_id: top-20 styles per S++ store (last 90 days) |

**Ignore:** `area_managers`, `salespeople`, `roster_daily`, `footfall_daily` (other case studies).

**Joins:** bill_lines → bills on bill_id · everything → items on sku_id · everything → stores on store_id · stores → calendar on state.

**Categories:** Sherwani, Indo-Western, Kurta Set, Jacket, Mojari, Safa, Mala, Stole, Packaging (excluded everywhere).
**Sizes:** apparel S–XXXL, Mojari 6–11, FS = free size.

### Open questions (answer when the workbook is opened, then update `CLAUDE.md`)
- Exact column names in `rules`, `min_display`, `lead_times`.
- Does `rules` define target cover / ageing thresholds? If yes, use theirs instead of our defaults.
- Are there returns / negative qty in `bill_lines`?

---

## 7. Engine logic

Pipeline: `prepare → velocity → needs/surplus → moves → validate → moves.json`. Grain is **store × SKU**. Exclude `is_packaging = 1`.

### 7.1 Velocity (what judges care about most)
Window: last 12 weeks = 84 days (matches `stock_weekly`).

- `units_12w` = units sold per store × SKU in the window.
- `instock_days` = sum of `days_in_stock` over the 12 weeks.
- **Own rate** = `units_12w / instock_days` (per in-stock day).
- **Prior rate** = network rate for the SKU (all stores, per in-stock day) × store's category index (store's share of category sales ÷ average store's share).
- **Blended velocity** = `(units_12w + K × prior) / (instock_days + K)`, **K = 14**.
- `velocity_basis`: `own` (instock_days ≥ 42), `blended` (14–41), `peer` (< 14). Drives the UI confidence dot.

Worked example: 3 units sold, 21 in-stock days, prior 0.4/day →
`(3 + 14 × 0.4) / (21 + 14) = 8.6 / 35 = 0.25/day`, basis `blended`.
A naive calendar rate would say 3 / 84 = 0.04/day and call it slow.

Why one formula handles the traps:
- Zero sales because it was out of stock → instock_days ≈ 0 → prior wins → real demand shows.
- Zero sales while in stock all 84 days → genuinely slow → ageing / pull-back candidate.
- Brand-new store or newly launched style → few in-stock days → prior.

**Forward uplift (only after v1 works):** per state × category, last year's daily rate in the next 30 days ÷ last year's daily rate in the preceding 12 weeks, clamped 0.6–2.5. `forward_velocity = velocity × uplift`. This is how the festival/wedding calendar is used without a forecast model.

### 7.2 Position per store × SKU
- `available = on_hand + in_transit`
- `cover_days = available / forward_velocity` (∞ if velocity 0)
- `target_units = ceil(forward_velocity × TARGET_COVER)` (45 days)
- `need = max(0, target_units − available)`
- `surplus = max(0, on_hand − ceil(forward_velocity × DONOR_KEEP))` (60 days)
- `stock_age_days = as_of − oldest_stock_received_on`
- Category level: `cat_units` vs `min_display(tier, category)`; store level: `store_units` vs `stock_capacity_units`
- `lost_sales_12w = velocity × (84 − instock_days)` → "would sell more if it held more"

### 7.3 Move generation, in order
**A. Warehouse → store** (first, cheapest)
- WH on_hand ≥ total need → fill everyone.
- Short → **fair share**: give one unit at a time to the store with the lowest cover after what it already got. Ties → higher velocity, then higher tier.
- Top up any store below min display for a category with that category's best sellers there.
- WH empty but `warehouse_inbound` lands before the store's stockout → `WAIT_FOR_INBOUND` flag, not a store → store move.

**B. Store → store** (only for need the warehouse could not cover)
- Donor: has surplus; not S++ with that style protected; keeps ≥ 30 days cover after; category stays ≥ min display.
- Pick the donor with the highest cover; prefer same city / shortest lead time.
- Skip if lead time > days until the receiver sells out anyway and need < 2 units.

**C. Ageing**
- Candidate: `stock_age_days ≥ 90` AND `cover_days ≥ 120` (or velocity 0 with real in-stock days). Fashion styles (`is_core_style = 0`) first.
- Send to the store with best velocity for that SKU that has room and need (trigger `AGEING`).
- No store wants it → `PULL_BACK` to WH-KOL, unless that breaks min display.

**D. Capacity guard:** before any inbound move, `store_units + in_transit + planned_in ≤ stock_capacity_units`. Overfull stores also pull back their slowest stock (trigger `OVER_CAPACITY`).

### 7.4 Validator (separate function, trusts nothing)
Recompute from raw position and assert, for every move and every store after all moves:
1. Min display kept per store × category
2. Capacity not exceeded
3. No protected style leaves an S++ store
4. In-transit counted; nothing sent to a store with enough arriving
5. Donor cover ≥ 30 days after store → store
6. qty ≤ what the source actually has (summed across moves)
7. arrives_on = today + lead time; reason present

Failing moves are dropped and logged. UI shows "Rule check: N moves, 0 violations".

### 7.5 Reason line templates (real numbers, ≤ ~110 chars)
- WH → store: `Sells 0.4/day, 3 left = 7 days cover; +12 from WH takes it to 37 days (arrives 4 Nov).`
- Stockout: `Out of stock 21 of last 84 days but sells 0.5/day when available; restock 15.`
- Store → store: `LKO-02 holds 140 days cover, BLR-01 has 6; moving 8 leaves LKO-02 at 62 days.`
- Ageing: `In PAT-03 for 132 days, 1 sold in 12 wks; sells 0.3/day in PAT-01. Move 6.`
- Pull back: `No store sells this size; 9 units, 150 days old, free up display space.`

### 7.6 Priority (UI sort order)
`priority = units_at_risk × mrp` (sales lost before normal replenishment would arrive). Ageing: `qty × mrp × age factor`.

### 7.7 Tunables (`lib/engine/params.ts`)
| Name | Value | Meaning |
|---|---|---|
| WINDOW_DAYS | 84 | velocity window |
| K | 14 | blending weight for prior |
| TARGET_COVER | 45 | days of cover a store aims for |
| DONOR_KEEP | 60 | days a donor keeps (margin over rule 4) |
| MIN_DONOR_COVER | 30 | rule 4 hard floor |
| AGE_DAYS | 90 | ageing threshold |
| AGE_COVER | 120 | ageing cover threshold |

Replace with values from the `rules` tab if it defines them.

---

## 8. The contract: `moves.json`

Engine writes it, UI reads only it. Changing a field = tell the other person and update `shared/moves.schema.md` + `shared/moves.sample.json`.

```ts
type Side = {
  on_hand: number;
  in_transit: number;
  velocity: number;            // units/day, forward-looking; 0 for warehouse
  cover_days: number | null;   // null = no sales / warehouse
};

type Move = {
  id: string;                  // "M0001"
  type: "WH_TO_STORE" | "STORE_TO_STORE" | "PULL_BACK";
  trigger: "LOW_COVER" | "STOCKOUT" | "UNDER_STOCKED" | "MIN_DISPLAY" | "AGEING" | "OVER_CAPACITY";
  sku_id: string; style_id: string; style_name: string;
  category: string; size: string; mrp: number;
  from: string; to: string;    // store_id or "WH-KOL"
  qty: number;
  lead_time_days: number; arrives_on: string;   // ISO date
  reason: string;
  from_before: Side; from_after: Side;
  to_before: Side;   to_after: Side;
  priority: number;            // UI sorts desc
  value_inr: number;           // qty × mrp
  velocity_basis: "own" | "blended" | "peer";
  stock_age_days: number | null;
  checks: { min_display: boolean; capacity: boolean; flagship: boolean;
            in_transit: boolean; donor_cover_30: boolean };   // all true or not in file
};

type Flag = {                  // problem found, deliberately no move
  kind: "WAIT_FOR_INBOUND" | "BLOCKED_FLAGSHIP" | "BLOCKED_DONOR_COVER" | "COVERED_BY_TRANSIT" | "NO_SOURCE";
  store_id: string; sku_id: string; note: string;
};

type MovesFile = {
  run: { as_of: string; generated_at: string; next_run_at: string; engine_version: string };
  summary: {
    moves: number; units: number; value_inr: number;
    by_type: Record<Move["type"], number>;
    stores_at_risk: number; violations: number;   // must be 0
    found: Record<string, number>;                // e.g. { stockout_masked_demand: 7 }
  };
  moves: Move[];
  flags: Flag[];
};
```

Chart data lives in `history.json`:
`{ "<store_id>|<sku_id>": [{ week_ending, units_sold, closing_on_hand, days_in_stock }] }`

Example move:
```json
{ "id": "M0001", "type": "WH_TO_STORE", "trigger": "LOW_COVER",
  "sku_id": "KUR-12-XL", "style_name": "Teal Cotton Silk Kurta Set", "size": "XL", "mrp": 6799,
  "from": "WH-KOL", "to": "LKO-03", "qty": 12, "lead_time_days": 3, "arrives_on": "2026-11-04",
  "reason": "Sells 0.42/day, 3 left = 7 days cover; +12 from warehouse takes it to 36 days (arrives 4 Nov).",
  "velocity_basis": "own", "priority": 92, "value_inr": 81588 }
```

---

## 9. Hidden-problem checklist (verify each appears in output before the demo)

| # | Planted problem | What our output should show |
|---|---|---|
| 1 | Fast seller with zero recent sales because it stocked out | `STOCKOUT` move, basis blended/peer |
| 2 | One size sold out while other sizes sit | Size-level move for that SKU only |
| 3 | Brand-new store with no history, under-stocked | Moves using peer velocity |
| 4 | Fashion (non-core) style ageing in a slow store, selling elsewhere | `AGEING` store → store move |
| 5 | Store looks short but has stock in transit | **No move**, `COVERED_BY_TRANSIT` flag |
| 6 | S++ flagship looks like a great donor for a protected style | **No move**, `BLOCKED_FLAGSHIP` flag |
| 7 | Donor would drop under 30 days cover | Move reduced, or `BLOCKED_DONOR_COVER` flag |
| 8 | Warehouse short on a hot SKU, several stores compete | Fair-share allocation across stores |
| 9 | Store at or over capacity | No inbound beyond capacity; `OVER_CAPACITY` pull-back |
| 10 | State-specific festival coming | Forward uplift in that state only |
| 11 | Category under min display | `MIN_DISPLAY` top-up |
| 12 | Packaging rows | Ignored everywhere |

---

## 10. UI (one screen does 90% of the demo)

Feels like an **inbox, not a dashboard**. Warm cream background, saffron/orange accent, deep maroon emphasis, serif headings, big readable numbers.

**Screen 1: Today's moves**
- Header: "Stock Mover" · As of 31 Oct 2026 · Last run 06:00 today · Next run 06:00 tomorrow
- 4 tiles: Moves to approve · Units moving · ₹ sales protected · Rule check "0 violations"
- Morning brief card (AI), hides if the AI call fails
- Tabs with counts: All · Warehouse → Store · Store → Store · Ageing · Pull back; filters: store, city, category
- Rows grouped by destination store (header: store, tier, capacity bar, "Approve all N")
- Row: style + size chip · `WH-KOL → LKO-03` · qty · reason · cover chip `7d → 37d` · arrives · confidence dot · ✓ / ✕
- Row expand: 12-week sales vs stock mini chart (out-of-stock weeks shaded), before/after for both ends, five rule ticks
- Keyboard: J/K move, A approve, R reject, Shift+A approve group. Sticky footer with progress + **Export approved (CSV)**. "Approve all high-confidence".

**Screen 2: Ask Stock Mover** (side drawer, chat grounded in moves.json). Chips: "Why is LKO-01 not giving stock?", "Which stores are most at risk this week?", "What did you find in the new store?"

**Screen 3: Found problems** (only if time, 20 min max): a card per checklist item with counts.

**Do not build:** login, settings, charts page, store map, dark mode, mobile.

---

## 11. AI via MeshAPI

OpenAI-compatible gateway. Base URL `https://api.meshapi.ai/v1`, auth `Bearer rsk_...`, model IDs provider-prefixed (default `openai/gpt-4o`). Docs: https://developers.meshapi.ai/llms.txt

```ts
// lib/ai.ts (server only)
import OpenAI from "openai";
export const ai = new OpenAI({ apiKey: process.env.MESH_API_KEY!, baseURL: "https://api.meshapi.ai/v1" });
export const MODEL = process.env.MESH_MODEL ?? "openai/gpt-4o";
```

Env vars (`.env.local` and Vercel): `MESH_API_KEY`, `MESH_MODEL`. Never commit, never in client code.

Only two features:
1. **Morning brief** `/api/brief`: summary + top 15 moves + flags → 4–5 plain-English lines. Cache per run.
2. **Ask Stock Mover** `/api/chat`: question + compact moves.json (+ positions for anything named) → streamed answer.

System prompt rule: *"Use only the numbers in the provided data. If it isn't there, say you don't have it."* If AI fails, the page still works.

---

## 12. Daily run
Vercel Cron hits `/api/run` daily at 06:00 IST (00:30 UTC). It runs the engine and writes `moves.json`; `run.generated_at` and `run.next_run_at` feed the header.

---

## 13. 4-hour plan

| Time | Jay (data + engine) | Asjad (UI + AI) |
|---|---|---|
| 0:00–0:20 | Workbook into `data/`, answer open questions, `scripts/prepare` | `create-next-app`, Tailwind, shadcn, **deploy empty app to Vercel** |
| 0:20–1:30 | Velocity + position + WH → store + validator → first real `moves.json` | Screen 1 on `moves.sample.json`: header, tabs, grouped rows, approve/reject |
| 1:30–2:30 | Store → store, ageing, pull back, capacity guard, priority | Real data, row expand + chart + rule ticks, shortcuts, CSV export |
| 2:30–3:10 | `/api/run` + Cron, forward uplift | Morning brief + chat drawer |
| 3:10–3:40 | Walk hidden-problem checklist, hand-check 5 moves in Excel | Polish, empty/loading states, Found problems if time |
| 3:40–4:00 | **Freeze.** Final deploy, rehearse twice | same |

**Rules of the day:** deploy in the first 20 minutes and after every milestone; never demo from localhost; UI never waits for the engine; anything 20+ minutes over plan gets cut.

**Cut order (from the top):** 1. Found problems screen · 2. Forward uplift · 3. Chat (keep brief) · 4. Mini chart · 5. Keyboard shortcuts.
**Never cut:** validator, reason lines, in-stock-day velocity, scheduled run, export.

---

## 14. 3-minute demo script
1. "It ran at 6am on its own. 118 moves, 0 rule violations."
2. Read the AI brief aloud.
3. Open a stockout move: "zero sales last 3 weeks; naive answer says slow; it was out of stock 21 days."
4. Open a blocked case: flagship protected style, or donor kept above 30 days.
5. Ageing move: fashion style stuck 130 days, moved to where it sells.
6. Shift+A a store group, export CSV. "Ten minutes, done."
7. Ask the chat one question.

---

## 15. Conventions and glossary
- IDs exactly as in the data: `store_id` (LKO-01), `sku_id` (KUR-12-XL), `style_id` (KUR-12), `WH-KOL`.
- Money ₹ including GST. Quantities whole units. Dates ISO.
- **Velocity:** units per in-stock day for a store × SKU.
- **Cover:** available stock ÷ daily velocity = days it will last.
- **In-stock day:** a day the store held ≥ 1 unit (`days_in_stock`).
- **Core style:** replenished all year. **Fashion style:** limited run, expires; ages first.
- **S++:** flagship tier; top-20 styles protected.
- **Donor / receiver:** giving / getting store in a store → store move.
- **Flag:** a problem we found where the right answer is deliberately *no move*.

## 16. Working with Claude on this project
- In Claude Code, open the repo: `CLAUDE.md` loads automatically.
- In this claude.ai Project, this file is the context. Ask for code against the spec above and the `moves.json` contract.
- Good asks: "Write `lib/engine/velocity.ts` per §7.1", "Build the move row component from §10 using the sample in §8", "Hand-check this move: …".
- Record decisions in `CLAUDE.md` → Decision log.
