import type { HistoryFile, MovesFile, MoveType, Scope } from '@sm/contract';
import { isStoreAtRisk } from '../engine/stores';

/** The location a scope is limited to, or null for all. */
export const scopeLocation = (scope: Scope): string | null => ('locationId' in scope ? scope.locationId : null);

/**
 * One location's view of a run: moves from or to it, its own store row and flags, problems that touch it
 * (move_ids trimmed to its moves), and the summary recomputed for that set. `blocked` and `run` stay as they are.
 * `summary.found` becomes the count of its problems by kind (the network-wide finding counts are not per store).
 */
export function scopeMoves(m: MovesFile, scope: Scope): MovesFile {
  const loc = scopeLocation(scope);
  if (loc === null) return m;
  const moves = m.moves.filter((mv) => mv.from === loc || mv.to === loc);
  const byId = new Map(moves.map((mv) => [mv.id, mv]));
  const stores = m.stores.filter((s) => s.store_id === loc);
  const problems = m.problems
    .filter((p) => p.subject.store_id === loc || p.move_ids.some((id) => byId.has(id)))
    .map((p) => {
      const move_ids = p.move_ids.filter((id) => byId.has(id));
      return { ...p, move_ids, needs_signoff_count: move_ids.filter((id) => byId.get(id)!.needs_signoff).length };
    });
  const by_type: Record<MoveType, number> = { WH_TO_STORE: 0, STORE_TO_STORE: 0, PULL_BACK: 0 };
  for (const mv of moves) by_type[mv.type]++;
  const found: Record<string, number> = {};
  for (const p of problems) found[p.kind.toLowerCase()] = (found[p.kind.toLowerCase()] ?? 0) + 1;
  return {
    ...m,
    summary: {
      moves: moves.length,
      units: moves.reduce((a, mv) => a + mv.qty, 0),
      value_inr: moves.reduce((a, mv) => a + mv.value_inr, 0),
      by_type,
      stores_at_risk: stores.filter(isStoreAtRisk).length,
      violations: m.summary.violations,
      found,
    },
    moves,
    flags: m.flags.filter((f) => f.store_id === loc),
    problems,
    stores,
  };
}

/** History rows for the store × SKU pairs of the scoped moves only. */
export function scopeHistory(h: HistoryFile, scoped: MovesFile): HistoryFile {
  const out: HistoryFile = {};
  for (const mv of scoped.moves) {
    for (const k of [`${mv.from}|${mv.sku_id}`, `${mv.to}|${mv.sku_id}`]) if (h[k]) out[k] = h[k];
  }
  return out;
}
