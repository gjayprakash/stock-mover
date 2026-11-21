import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { AiCall, Scope } from '@sm/contract';
import { scopeLocation } from '../runs/scoped';
import { DbService } from '../db/db.service';

const RING = 200;

/** Append-only log of every AI call (shape = AiCall). Postgres when configured, else an in-memory ring of 200. */
@Injectable()
export class AiLogService implements OnModuleInit {
  private readonly log = new Logger('AiLog');
  private readonly memory: AiCall[] = [];

  constructor(private readonly db: DbService) {}

  async onModuleInit() {
    if (!this.db.configured) return;
    await this.db.query(`
      create table if not exists ai_calls (
        id text primary key,
        run_id text not null,
        at timestamptz not null,
        job text not null,
        input_summary text not null,
        output text not null,
        numbers_found int not null,
        numbers_total int not null,
        result text not null,
        held_reason text,
        model text not null,
        tokens_in int,
        tokens_out int,
        latency_ms int not null
      )`);
    await this.db.query(`create index if not exists ai_calls_run on ai_calls (run_id, at desc)`);
    // Ask v2: DATA / GENERAL / MIXED (null for briefs and older rows).
    await this.db.query(`alter table ai_calls add column if not exists mode text`);
  }

  async add(call: Omit<AiCall, 'id' | 'at'>): Promise<AiCall> {
    const row: AiCall = { id: randomUUID(), at: new Date().toISOString(), ...call };
    if (!this.db.configured) {
      this.memory.unshift(row);
      this.memory.length = Math.min(this.memory.length, RING);
      return row;
    }
    await this.db
      .query(
        `insert into ai_calls (id, run_id, at, job, input_summary, output, numbers_found, numbers_total, result,
           held_reason, model, tokens_in, tokens_out, latency_ms, mode)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [row.id, row.run_id, row.at, row.job, row.input_summary, row.output, row.numbers_found, row.numbers_total,
          row.result, row.held_reason ?? null, row.model, row.tokens_in ?? null, row.tokens_out ?? null, row.latency_ms, row.mode ?? null],
      )
      .catch((e) => this.log.error(`could not log AI call: ${(e as Error).message}`));
    return row;
  }

  /**
   * The latest AI brief already shown for this run, so a restart reuses it instead of asking the model again (#18).
   * Only SHOWN rows count: template fallbacks are logged as ERROR / HELD_BACK, so they never block a later AI brief.
   */
  /** The whole-network brief only: one location's brief (#77) starts its input_summary with "location ". */
  async latestShownBrief(runId: string): Promise<AiCall | null> {
    const real = (c: Pick<AiCall, 'model' | 'output'>) => !!c.output && !!c.model && c.model !== 'template';
    if (!this.db.configured) {
      return this.memory.find((c) => c.run_id === runId && c.job === 'BRIEF' && c.result === 'SHOWN' && real(c) && !c.input_summary.startsWith('location ')) ?? null;
    }
    const rows = await this.db.query<AiCall & { at: Date }>(
      `select * from ai_calls
        where run_id = $1 and job = 'BRIEF' and result = 'SHOWN' and output <> '' and model not in ('', 'template')
          and input_summary not like 'location %'
        order by at desc limit 1`,
      [runId],
    );
    return rows[0] ? { ...rows[0], at: rows[0].at.toISOString() } : null;
  }

  /** AI calls, newest first. A location scope sees only the calls made for that location (input_summary "location X: …"). */
  async list(scope: Scope, runId?: string) {
    let calls: AiCall[];
    if (!this.db.configured) {
      calls = this.memory.filter((c) => !runId || c.run_id === runId);
    } else {
      const rows = await this.db.query<AiCall & { at: Date }>(
        `select * from ai_calls where ($1::text is null or run_id = $1) order by at desc limit 500`,
        [runId ?? null],
      );
      calls = rows.map((r) => {
        const c: AiCall = { ...r, at: r.at.toISOString() };
        for (const k of ['held_reason', 'tokens_in', 'tokens_out', 'mode'] as const) if (c[k] === null) delete c[k];
        return c;
      });
    }
    const loc = scopeLocation(scope);
    if (loc) calls = calls.filter((c) => c.input_summary.startsWith(`location ${loc}: `));
    const held = calls.filter((c) => c.result === 'HELD_BACK');
    const reasons = new Map<string, number>();
    held.forEach((c) => c.held_reason && reasons.set(c.held_reason, (reasons.get(c.held_reason) ?? 0) + 1));
    const top = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      calls,
      totals: {
        briefs: calls.filter((c) => c.job === 'BRIEF').length,
        questions: calls.filter((c) => c.job === 'ASK').length,
        numbers_found: calls.reduce((t, c) => t + c.numbers_found, 0),
        numbers_total: calls.reduce((t, c) => t + c.numbers_total, 0),
        held_back: held.length,
        top_held_reason: top ? top[0] : null,
      },
    };
  }
}
