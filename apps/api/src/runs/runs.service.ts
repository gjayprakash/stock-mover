import { ConflictException, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { join } from 'path';
import type { HistoryFile, MovesFile, RunRow } from '@sm/contract';
import { DbService } from '../db/db.service';
import { runEngine } from '../engine';
import { GeoService } from '../geo/geo.service';

export const AS_OF = '2026-10-31';
export const TODAY = '2026-11-01';
const KEEP_RUNS = 14;
// apps/api/dist/runs -> repo root; same depth from src/runs under ts-node.
const DATA_DIR = join(__dirname, '..', '..', '..', '..', 'data', 'csv');

export type FinishedRun = { run_id: string; moves: MovesFile; history: HistoryFile };
type RunFinishedHook = (run: FinishedRun) => unknown;

@Injectable()
export class RunsService implements OnApplicationBootstrap {
  private readonly log = new Logger('Runs');
  private running = false;
  private cache: FinishedRun | null = null;
  private readonly hooks: RunFinishedHook[] = [];

  constructor(
    private readonly db: DbService,
    private readonly geo: GeoService,
  ) {}

  /** Other modules (AI brief) register here; called after every FINISHED run, errors are logged and ignored. */
  onRunFinished(hook: RunFinishedHook) {
    this.hooks.push(hook);
  }

  async onApplicationBootstrap() {
    if (!this.db.configured) {
      this.log.warn('DATABASE_URL not set: runs disabled');
      return;
    }
    await this.db.migrate();
    // A run cut off by a restart never finishes; close it so it is not shown as RUNNING forever.
    await this.db.query(
      `update runs set status = 'FAILED', finished_at = now(), error = 'interrupted by restart' where status = 'RUNNING'`,
    );
    const [done] = await this.db.query(`select 1 from runs where status = 'FINISHED' limit 1`);
    if (!done) await this.start('boot');
  }

  /** Inserts a RUNNING row and runs the engine in the background. Returns the new run_id. */
  async start(trigger: RunRow['trigger']): Promise<string> {
    if (this.running) throw new ConflictException({ error: 'a run is already in progress' });
    this.running = true;
    const now = new Date();
    const runId = 'run-' + now.toISOString().replace(/[-:.]/g, '').replace('Z', '');
    try {
      await this.db.query(
        `insert into runs (run_id, as_of, started_at, status, trigger) values ($1, $2, $3, 'RUNNING', $4)`,
        [runId, AS_OF, now, trigger],
      );
    } catch (e) {
      this.running = false;
      throw e;
    }
    setImmediate(() => void this.execute(runId, now));
    return runId;
  }

  private async execute(runId: string, now: Date) {
    try {
      const { moves, history } = runEngine({
        dataDir: DATA_DIR, asOf: AS_OF, today: TODAY, now, runId, locations: this.geo.locations(),
      });
      const violations = moves.summary.violations;
      if (violations > 0) throw new Error(`validator found ${violations} rule violations; list not published`);
      await this.db.query(
        `update runs set status = 'FINISHED', finished_at = now(), moves_json = $2, history_json = $3,
           move_count = $4, violations = $5 where run_id = $1`,
        [runId, JSON.stringify(moves), JSON.stringify(history), moves.moves.length, violations],
      );
      this.cache = { run_id: runId, moves, history };
      this.log.log(`${runId} FINISHED: ${moves.moves.length} moves`);
      for (const hook of this.hooks) {
        try {
          await hook(this.cache);
        } catch (e) {
          this.log.error(`onRunFinished hook failed: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      const msg = (e as Error).message;
      this.log.error(`${runId} FAILED: ${msg}`);
      await this.db
        .query(`update runs set status = 'FAILED', finished_at = now(), error = $2 where run_id = $1`, [runId, msg])
        .catch((err) => this.log.error(`could not record failure: ${(err as Error).message}`));
    } finally {
      this.running = false;
      await this.db
        .query(`delete from runs where run_id not in (select run_id from runs order by started_at desc limit $1)`, [KEEP_RUNS])
        .catch(() => undefined);
    }
  }

  async list(): Promise<RunRow[]> {
    const rows = await this.db.query<{
      run_id: string; as_of: string; started_at: Date; finished_at: Date | null; status: RunRow['status'];
      trigger: RunRow['trigger']; move_count: number; violations: number; error: string | null;
    }>(
      `select run_id, as_of::text as as_of, started_at, finished_at, status, trigger, move_count, violations, error
         from runs order by started_at desc`,
    );
    return rows.map((r) => ({
      run_id: r.run_id,
      as_of: r.as_of,
      started_at: r.started_at.toISOString(),
      finished_at: r.finished_at ? r.finished_at.toISOString() : null,
      status: r.status,
      trigger: r.trigger,
      moves: r.move_count,
      violations: r.violations,
      ...(r.error ? { error: r.error } : {}),
    }));
  }

  /** Latest FINISHED run, cached in memory by run_id. */
  async latest(): Promise<FinishedRun | null> {
    if (!this.db.configured) return null;
    const [head] = await this.db.query<{ run_id: string }>(
      `select run_id from runs where status = 'FINISHED' order by finished_at desc limit 1`,
    );
    if (!head) return null;
    if (this.cache?.run_id === head.run_id) return this.cache;
    const [row] = await this.db.query<{ moves_json: MovesFile; history_json: HistoryFile }>(
      `select moves_json, history_json from runs where run_id = $1`,
      [head.run_id],
    );
    this.cache = { run_id: head.run_id, moves: row.moves_json, history: row.history_json };
    return this.cache;
  }
}
