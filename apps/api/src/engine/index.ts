import type { HistoryFile, MovesFile } from '@sm/contract';
import { loadData, loadLocations, type Store } from './data';
import { buildPositions, type ExtraItem, type Receipt } from './position';
import { generateMoves } from './moves';
import { validate } from './validate';
import { buildSummary, buildHistory, nextRunAt } from './summary';
import { buildStores } from './stores';
import { buildProblems } from './problems';

// Contract between Jay-A (engine) and Jay-B (API). Do not change without telling the other lane.
// Extensions must be additive (optional fields).
export type EngineInput = {
  dataDir: string; asOf: string; today: string; now: Date; runId: string;
  /** #20: lat/lng per store_id + WH-KOL, loaded from store_locations by RunsService. */
  locations?: Record<string, { lat: number; lng: number }>;
  /** #21: stores added in the app (same columns as stores.csv). Pass to loadData(dataDir, extraStores). */
  extraStores?: Store[];
  /** #23: committed stock receipts (Add stock) and the SKUs those uploads created. Applied from the next run. */
  receipts?: Receipt[];
  extraItems?: ExtraItem[];
};
export type EngineOutput = { moves: MovesFile; history: HistoryFile };

// Bump on any engine change that alters the move list: RunsService re-runs on boot when the latest list has another version.
export const ENGINE_VERSION = '1.2';

/** loadData → buildPositions → generateMoves → validate → summary. Throws (run FAILS) on any violation. */
export function runEngine(input: EngineInput): EngineOutput {
  const P = buildPositions(loadData(input.dataDir, input.extraStores), input.locations ?? loadLocations(input.dataDir), input.receipts, input.extraItems);
  const gen = generateMoves(P);
  const checked = validate(P, gen.moves);
  for (const d of checked.dropped) console.warn(`[engine] dropped ${d.move_id} (${d.rule}): ${d.detail}`);
  if (checked.violations.length) {
    throw new Error(`engine: ${checked.violations.length} rule violations remain after validation: ` +
      checked.violations.slice(0, 5).map((v) => `${v.move_id} ${v.rule} ${v.detail}`).join('; '));
  }
  const moves = checked.moves;
  const summary = buildSummary(P, moves, checked.violations.length);
  const stores = buildStores(P, moves);
  const found = buildProblems(P, moves, stores);
  summary.found.starved_bestseller = found.starved_bestseller;
  return {
    moves: {
      run: {
        run_id: input.runId, status: 'FINISHED', as_of: input.asOf,
        generated_at: input.now.toISOString(), next_run_at: nextRunAt(input.now), engine_version: ENGINE_VERSION,
      },
      summary,
      moves,
      flags: gen.flags,
      problems: found.problems,
      stores,
      blocked: gen.blocked,
    },
    history: buildHistory(P, moves),
  };
}
