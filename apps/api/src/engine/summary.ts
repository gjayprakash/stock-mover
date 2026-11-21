import type { Move, MovesFile, MoveType, HistoryFile } from '@sm/contract';
import type { Positions } from './position';
import { AGE_COVER, AGE_DAYS, BASIS_BLENDED_DAYS, MIN_NEED_VELOCITY } from './params';
import { key } from './clean';
import { buildStores, isStoreAtRisk } from './stores';

export function buildSummary(P: Positions, moves: Move[], violations: number): MovesFile['summary'] {
  const by_type: Record<MoveType, number> = { WH_TO_STORE: 0, STORE_TO_STORE: 0, PULL_BACK: 0 };
  for (const m of moves) by_type[m.type]++;
  const rows = [...P.rows.values()];
  // Counted from the store rows so it ties out with the store pages (sold-out sellers, or not NORMAL).
  const stores_at_risk = buildStores(P, moves).filter(isStoreAtRisk).length;

  let over = 0, belowMin = 0;
  for (const st of P.c.stores) {
    const s = P.byStore.get(st.store_id)!;
    // Same stock as stores[].stock_now and the capacity rule: a count flagged as wrong is not real stock
    // (it is counted under data_flags instead).
    if (s.store_units + s.store_in_transit > s.capacity) over++;
    for (const [cat, min] of Object.entries(s.min_display)) if ((s.cat_units[cat] ?? 0) < min) belowMin++;
  }
  return {
    moves: moves.length,
    units: moves.reduce((a, m) => a + m.qty, 0),
    value_inr: moves.reduce((a, m) => a + m.value_inr, 0),
    by_type,
    stores_at_risk,
    violations,
    found: {
      // sells ≥ 1 piece per 45 days by the peer prior, yet 0 sold because it was barely on the shelf
      stockout_masked_demand: rows.filter((p) => p.units_12w === 0 && p.instock_days < BASIS_BLENDED_DAYS && p.velocity >= MIN_NEED_VELOCITY).length,
      over_capacity: over,
      data_flags: P.flags.length,
      below_min_display: belowMin,
      ageing_units: rows.filter((p) => !p.flagged && (p.stock_age_days ?? 0) >= AGE_DAYS && (p.cover_days ?? Infinity) >= AGE_COVER).reduce((a, p) => a + p.on_hand, 0),
      starved_bestseller: 0,
    },
  };
}

/** 12-week chart rows for every store×SKU that appears in a move. */
export function buildHistory(P: Positions, moves: Move[]): HistoryFile {
  const h: HistoryFile = {};
  for (const m of moves) {
    for (const store of [m.from, m.to]) {
      const k = key(store, m.sku_id);
      const p = P.rows.get(k);
      if (!p || h[k]) continue;
      h[k] = P.c.weeks.map((w, i) => ({ week_ending: w, units_sold: p.v.weekly_units[i], closing_on_hand: p.v.weekly_closing[i], days_in_stock: p.v.weekly_days[i] }));
    }
  }
  return h;
}

/** Next 06:00 IST (00:30 UTC) strictly after now. */
export function nextRunAt(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 30, 0));
  if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}
