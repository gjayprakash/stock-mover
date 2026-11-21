# The brief, condensed (source: `00-participant-brief.pdf`)

## Ask
Every day, find stock that is in the wrong place. Produce a ready-to-approve list:
what to send from the warehouse, what to move between stores, what to pull back.

## Must handle
1. **Warehouse → store**: what to send and to whom, when there isn't enough for everyone.
2. **Under-stocked stores**: stores that would sell more if they held more.
3. **Store → store**: from where stock sits to where it sells.
4. **Ageing stock**: move it to where it sells before it's too late.

## Key terms
- **Velocity** = how fast a style+size sells in a store (units/day).
- **Cover** = stock ÷ daily velocity = days the stock will last.

## Rules
See `CLAUDE.md` → "The five rules".

## Data (one Excel workbook, CSV copy available). Tabs we USE
| Tab | One row is | Rows | Key columns |
|---|---|---|---|
| stores | store | 20 | store_id, city, state, zone, tier (S++, S+, A, B), size_sqft, stock_capacity_units, opened_on (one store is brand new), area_manager_id |
| items | SKU (style+size) | 385 | sku_id, style_id, style_name, category, size, mrp, cost_price, launch_date, is_core_style (1 = replenished all year, 0 = limited fashion run), is_packaging (1 = bag/box, ₹0, not a product) |
| bills | bill | 90,805 | bill_id, bill_date, store_id, salesperson_id, customer_id |
| bill_lines | item on a bill | 259,772 | bill_id, sku_id, qty, mrp, selling_price |
| stock_snapshot | location × SKU | 3,547 | as_of_date (2026-10-31), location_id (store or WH-KOL), sku_id, on_hand, in_transit, in_transit_arrives_on, oldest_stock_received_on |
| stock_weekly | store × SKU × week | 61,416 | week_ending (15 Aug – 31 Oct 2026, Sun–Sat weeks), store_id, sku_id, closing_on_hand, days_in_stock (0–7) |
| warehouse_inbound | delivery | 768 | expected_date (from 1 Nov 2026), sku_id, qty, status |
| calendar | date × state | 2,373 | date, state, festival, is_wedding_date (Nov 2024 – Dec 2026) |
| rules, min_display, lead_times | rule/setting | — | stock rules; min display per tier × category (e.g. S++ · Kurta Set · 120); days a move takes |
| flagship_protected | store × rank | — | store_id, rank, style_id: top-20 styles of each S++ store (last 90 days) |

Tabs we IGNORE: area_managers, salespeople, roster_daily, footfall_daily.

## Facts
- Sales: 1 Nov 2024 → 31 Oct 2026. Stock tabs: close of 31 Oct 2026.
- 6 cities, 3 states. Zones: North = Uttar Pradesh, East = Bihar, South = Karnataka.
- Categories: Sherwani, Indo-Western, Kurta Set, Jacket, Mojari, Safa, Mala, Stole, Packaging.
- Sizes: apparel S–XXXL, Mojari 6–11, FS = free size.
- Joins: bill_lines → bills on bill_id; everything → items on sku_id; everything → stores on store_id; stores → calendar on state.
- Data is synthetic and scaled down.
