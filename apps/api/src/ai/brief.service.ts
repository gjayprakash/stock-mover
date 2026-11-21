import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { BriefResponse, MovesFile } from '@sm/contract';
import { RunsService, TODAY } from '../runs/runs.service';
import { AiLogService } from './ai-log.service';
import { briefContext } from './context';
import { AllowedSet } from './grounding';
import { MeshClient, type ChatMessage } from './mesh.client';
import { BRIEF_TASK, SYSTEM_RULES, correction } from './prompts';

const inr = (n: number) => '₹' + n.toLocaleString('en-IN');

/** Deterministic brief from summary + problem titles; used when AI is off, down or ungrounded. */
function templateBrief(m: MovesFile): string {
  const s = m.summary;
  const lines = [`Today's list has ${s.moves} moves: ${s.units} units worth ${inr(s.value_inr)}.`];
  m.problems.slice(0, 3).forEach((p) => lines.push(`${p.title}.`));
  if (m.blocked.donor_cover_30 > 0) lines.push(`${m.blocked.donor_cover_30} moves were stopped by the 30-day donor cover rule.`);
  return lines.join('\n');
}

@Injectable()
export class BriefService implements OnModuleInit {
  private readonly log = new Logger('Brief');
  private readonly cache = new Map<string, Promise<BriefResponse>>();

  constructor(
    private readonly runs: RunsService,
    private readonly mesh: MeshClient,
    private readonly aiLog: AiLogService,
  ) {}

  onModuleInit() {
    this.runs.onRunFinished((run) => this.forRun(run.moves));
  }

  async latest(): Promise<BriefResponse | null> {
    const run = await this.runs.latest();
    return run ? this.forRun(run.moves) : null;
  }

  /** One brief per run_id; concurrent callers share the same promise. */
  forRun(m: MovesFile): Promise<BriefResponse> {
    const id = m.run.run_id;
    let p = this.cache.get(id);
    if (!p) {
      p = this.generate(m);
      this.cache.set(id, p);
      p.catch(() => this.cache.delete(id));
      if (this.cache.size > 5) this.cache.delete(this.cache.keys().next().value!);
    }
    return p;
  }

  private async generate(m: MovesFile): Promise<BriefResponse> {
    const ctx = briefContext(m);
    const allowed = new AllowedSet(ctx, [m.run.as_of, TODAY]);
    const template = (): BriefResponse => {
      const text = templateBrief(m);
      const g = allowed.check(text);
      return { text, numbers_found: g.found, numbers_total: g.total, generated_at: new Date().toISOString(), source: 'TEMPLATE' };
    };
    const started = Date.now();
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_RULES },
      { role: 'user', content: `${BRIEF_TASK}\n\nDATA:\n${JSON.stringify(ctx)}` },
    ];
    const base = { run_id: m.run.run_id, job: 'BRIEF' as const, model: this.mesh.model,
      input_summary: `summary + ${m.problems.length} problems + blocked` };
    if (!this.mesh.available) {
      await this.aiLog.add({ ...base, output: 'MESH_API_KEY not set; template brief shown', numbers_found: 0, numbers_total: 0,
        result: 'ERROR', held_reason: 'MODEL_ERROR', latency_ms: 0 });
      return template();
    }
    let tokensIn = 0;
    let tokensOut = 0;
    try {
      let out = await this.mesh.complete(messages);
      tokensIn += out.tokens_in ?? 0;
      tokensOut += out.tokens_out ?? 0;
      let g = allowed.check(out.text);
      if (!g.ok) {
        out = await this.mesh.complete([...messages, { role: 'assistant', content: out.text }, { role: 'user', content: correction(g.missing) }]);
        tokensIn += out.tokens_in ?? 0;
        tokensOut += out.tokens_out ?? 0;
        g = allowed.check(out.text);
      }
      const usage = { tokens_in: tokensIn, tokens_out: tokensOut, latency_ms: Date.now() - started };
      if (!g.ok || !out.text) {
        await this.aiLog.add({ ...base, ...usage, output: out.text, numbers_found: g.found, numbers_total: g.total,
          result: 'HELD_BACK', held_reason: 'UNGROUNDED_NUMBER' });
        return template();
      }
      await this.aiLog.add({ ...base, ...usage, output: out.text, numbers_found: g.found, numbers_total: g.total, result: 'SHOWN' });
      return { text: out.text, numbers_found: g.found, numbers_total: g.total, generated_at: new Date().toISOString(), source: 'AI' };
    } catch (e) {
      this.log.warn(`brief failed, using template: ${(e as Error).message}`);
      await this.aiLog.add({ ...base, output: '', numbers_found: 0, numbers_total: 0, result: 'ERROR',
        held_reason: 'MODEL_ERROR', latency_ms: Date.now() - started });
      return template();
    }
  }
}
