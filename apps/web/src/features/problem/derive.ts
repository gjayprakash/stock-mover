import type { HistoryFile, Move, Problem } from '@sm/contract';

export type Chart = NonNullable<Problem['chart']>;

/** Fix-card numbers, computed from the problem's own moves so they always match the list. */
export function fixTotals(moves: Move[]) {
  return {
    units: moves.reduce((s, m) => s + m.qty, 0),
    stores: new Set(moves.map((m) => m.to)).size,
    entries: moves.length,
    value: moves.reduce((s, m) => s + m.value_inr, 0),
    signoff: moves.filter((m) => m.needs_signoff),
  };
}

/** Pieces per destination, biggest first. */
export function byDestination(moves: Move[]): { to: string; qty: number }[] {
  const map = new Map<string, number>();
  for (const m of moves) map.set(m.to, (map.get(m.to) ?? 0) + m.qty);
  return [...map.entries()].map(([to, qty]) => ({ to, qty })).sort((a, b) => b.qty - a.qty);
}

/**
 * Stock tiles from what the moves file already holds:
 * receiving stores now (before, per store+SKU) and the warehouse now (before its first move, per SKU).
 */
export function stockTiles(moves: Move[]) {
  const atStores = new Map<string, number>();
  const atWarehouse = new Map<string, number>();
  for (const m of moves) {
    atStores.set(`${m.to}|${m.sku_id}`, m.to_before.on_hand + m.to_before.in_transit);
    if (m.from === 'WH-KOL') atWarehouse.set(m.sku_id, Math.max(atWarehouse.get(m.sku_id) ?? 0, m.from_before.on_hand));
  }
  const sum = (x: Map<string, number>) => [...x.values()].reduce((s, v) => s + v, 0);
  return { storesNow: sum(atStores), storeCount: new Set(moves.map((m) => m.to)).size, warehouseNow: atWarehouse.size ? sum(atWarehouse) : null };
}

/** History keys ("STORE|SKU") to rebuild a chart when the problem has none. */
export function historyKeys(problem: Problem, moves: Move[]): string[] {
  const { store_id, sku_id } = problem.subject;
  if (store_id && sku_id) return [`${store_id}|${sku_id}`];
  return moves.map((m) => `${m.to}|${m.sku_id}`);
}

/** Sums history rows by week into "Units sold" and "Days in stock" (same names as problem.chart). */
export function chartFromHistory(file: HistoryFile, label: string): Chart | null {
  const weeks = new Map<string, { sold: number; days: number }>();
  for (const rows of Object.values(file)) {
    for (const r of rows) {
      const w = weeks.get(r.week_ending) ?? { sold: 0, days: 0 };
      w.sold += r.units_sold;
      w.days += r.days_in_stock;
      weeks.set(r.week_ending, w);
    }
  }
  if (!weeks.size) return null;
  const keys = [...weeks.keys()].sort();
  return {
    label,
    weeks: keys,
    series: [
      { name: 'Units sold', values: keys.map((k) => weeks.get(k)!.sold) },
      { name: 'Days in stock', values: keys.map((k) => weeks.get(k)!.days) },
    ],
  };
}
