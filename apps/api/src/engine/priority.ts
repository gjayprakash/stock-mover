// Sort order for the UI (docs/02-engine.md §6). Higher = more urgent.
import { AGE_DAYS, REPLENISH_CYCLE_DAYS } from './params';

/**
 * Restocking moves: sales lost before a normal weekly replenishment would land
 * (units_at_risk = velocity × days without stock until cycle + lead time) × MRP,
 * plus 1% of the move value so zero-risk moves still sort by value.
 */
export function restockPriority(p: { v: number; available: number; leadTime: number; qty: number; mrp: number }): number {
  const daysCovered = p.v > 0 ? p.available / p.v : Infinity;
  const gap = Math.max(0, REPLENISH_CYCLE_DAYS + p.leadTime - daysCovered);
  const atRisk = Math.min(p.qty, p.v * gap);
  return Math.round(atRisk * p.mrp + 0.01 * p.qty * p.mrp);
}

/** Ageing and pull-back moves: qty × MRP × age factor, age factor = min(2, age / 90). */
export function ageingPriority(p: { qty: number; mrp: number; age: number | null }): number {
  const factor = Math.min(2, (p.age ?? AGE_DAYS) / AGE_DAYS);
  return Math.round(p.qty * p.mrp * factor);
}
