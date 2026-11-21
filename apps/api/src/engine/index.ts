import type { HistoryFile, MovesFile } from '@sm/contract';
import { loadData } from './data';
import { buildPositions } from './position';
import { generateMoves } from './moves';
import { validate } from './validate';
import { buildSummary, buildHistory, nextRunAt } from './summary';

// Contract between Jay-A (engine) and Jay-B (API). Do not change without telling the other lane.
// Extensions must be additive (optional fields).
export type EngineInput = {
  dataDir: string; asOf: string; today: string; now: Date; runId: string;
  /** #20: lat/lng per store_id + WH-KOL, loaded from store_locations by RunsService. */
  locations?: Record<string, { lat: number; lng: number }>;
};
export type EngineOutput = { moves: MovesFile; history: HistoryFile };

export const ENGINE_VERSION = '1.0';

/** loadData → buildPositions → generateMoves → validate → summary. Throws (run FAILS) on any violation. */
export function runEngine(input: EngineInput): EngineOutput {
  const P = buildPositions(loadData(input.dataDir));
  const gen = generateMoves(P);
  const checked = validate(P, gen.moves);
  for (const d of checked.dropped) console.warn(`[engine] dropped ${d.move_id} (${d.rule}): ${d.detail}`);
  if (checked.violations.length) {
    throw new Error(`engine: ${checked.violations.length} rule violations remain after validation: ` +
      checked.violations.slice(0, 5).map((v) => `${v.move_id} ${v.rule} ${v.detail}`).join('; '));
  }
  const moves = checked.moves;
  return {
    moves: {
      run: {
        run_id: input.runId, status: 'FINISHED', as_of: input.asOf,
        generated_at: input.now.toISOString(), next_run_at: nextRunAt(input.now), engine_version: ENGINE_VERSION,
      },
      summary: buildSummary(P, moves, checked.violations.length),
      moves,
      flags: gen.flags,
      problems: [],
      stores: [],
      blocked: gen.blocked,
    },
    history: buildHistory(P, moves),
  };
}
