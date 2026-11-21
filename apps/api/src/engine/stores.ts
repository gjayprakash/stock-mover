import type { Move, StoreSummary } from '@sm/contract';
import { DISPLAY_CATEGORIES, displayCategory } from './clean';
import type { Positions } from './position';
import { LOW_COVER_DISPLAY, MIN_NEED_VELOCITY } from './params';

/**
 * "At risk" for summary.stores_at_risk: a store with an item that sells but is sold out,
 * or a store that is too full / running empty. Same numbers the store page shows.
 */
export const isStoreAtRisk = (s: StoreSummary) => s.sold_out_with_demand > 0 || s.status !== 'NORMAL';

/** One summary per store (all 20), see Store detail algorithm in #7. */
export function buildStores(P: Positions, moves: Move[]): StoreSummary[] {
  const rows = [...P.rows.values()];
  return P.c.stores.map((st) => {
    const mine = rows.filter((p) => p.store_id === st.store_id);
    const ins = moves.filter((m) => m.to === st.store_id);
    const outs = moves.filter((m) => m.from === st.store_id);
    const sp = P.byStore.get(st.store_id)!;
    // Same stock the move generator and validator check against capacity (rule 1): a count flagged as wrong
    // (DATA_COUNT_MISMATCH) is taken at last week's closing count, not the snapshot. Σ categories[].now + in transit.
    const stock_now = sp.store_units + sp.store_in_transit;
    const in_units = ins.reduce((a, m) => a + m.qty, 0);
    const out_units = outs.reduce((a, m) => a + m.qty, 0);
    const demand = mine.filter((p) => p.velocity >= MIN_NEED_VELOCITY);
    const soldOut = demand.filter((p) => p.available === 0);
    const fill = stock_now / st.stock_capacity_units;
    return {
      store_id: st.store_id, city: st.city, zone: st.zone, tier: st.tier, capacity: st.stock_capacity_units, opened_on: st.opened_on,
      stock_now, stock_after: stock_now + in_units - out_units, in_units, out_units,
      low_cover_skus: demand.filter((p) => (p.cover_days ?? Infinity) < LOW_COVER_DISPLAY).length,
      sold_out_with_demand: soldOut.length,
      at_risk_week_inr: Math.round(soldOut.reduce((a, p) => a + p.velocity * 7 * p.mrp, 0)),
      categories: DISPLAY_CATEGORIES.map((category) => ({
        category,
        min_display: sp.min_display[category] ?? 0,
        now: sp.cat_units[category] ?? 0,
        incoming: ins.filter((m) => displayCategory(m.category) === category).reduce((a, m) => a + m.qty, 0),
        outgoing: outs.filter((m) => displayCategory(m.category) === category).reduce((a, m) => a + m.qty, 0),
      })),
      status: fill > 1 ? 'TOO_FULL' : fill < 0.5 ? 'RUNNING_EMPTY' : 'NORMAL',
    };
  });
}
