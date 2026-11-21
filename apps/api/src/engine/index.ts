import { readFileSync } from 'node:fs';
import type { HistoryFile, MovesFile } from '@sm/contract';

// Contract between Jay-A (engine) and Jay-B (API). Do not change without telling the other lane.
// Extensions must be additive (optional fields).
export type EngineInput = { dataDir: string; asOf: string; today: string; now: Date; runId: string };
export type EngineOutput = { moves: MovesFile; history: HistoryFile };

const sample = <T>(file: string): T => JSON.parse(readFileSync(require.resolve(`@sm/contract/${file}`), 'utf8')) as T;

// STUB: returns the sample files with run fields filled from input. Jay-A replaces the body.
export function runEngine(input: EngineInput): EngineOutput {
  const moves = sample<MovesFile>('moves.sample.json');
  const next = new Date(input.now.getTime() + 24 * 60 * 60 * 1000);
  moves.run = {
    ...moves.run,
    run_id: input.runId,
    status: 'FINISHED',
    as_of: input.asOf,
    generated_at: input.now.toISOString(),
    next_run_at: next.toISOString(),
    engine_version: 'stub',
  };
  return { moves, history: sample<HistoryFile>('history.sample.json') };
}
