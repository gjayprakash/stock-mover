import { BadRequestException, Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { AiCall, MovesFile, Scope } from '@sm/contract';
import { ReqScope } from '../auth/scope';
import { scopeLocation } from '../runs/scoped';
import { RunsService, TODAY } from '../runs/runs.service';
import { AiLogService } from './ai-log.service';
import { classify, planWords, type Mode, type Plan } from './classify';
import { chatContext } from './context';
import { cleanTags, followUps, recognise, type About } from './entities';
import { AllowedSet, type GroundingResult, type LineSource } from './grounding';
import { checkAnswer, type AnswerCheck } from './answer-check';
import { MeshClient, type ChatMessage } from './mesh.client';
import {
  CHAT_RULES, FORECAST_RULE, GENERAL_RULES, MIXED_RULE, SYSTEM_RULES, WIDER_RULES,
  correction, generalCorrection, scopeRule,
} from './prompts';
import { historyData, rulesData, rulesSource, runsData } from './sources';

const MAX_QUESTION = 2000;
const MAX_TURNS = 6;
const UNAVAILABLE = 'Ask is not available right now. Everything else works.';
const HELD = 'The answer had a number that could not be checked against your data, so it is not shown. Try one of the questions below.';
const HELD_GENERAL = 'The answer stated figures about your stores that could not be checked, so it is not shown. Try one of the questions below.';

type Turn = { role: 'user' | 'assistant'; content: string };
type ChatBody = { question?: unknown; history?: unknown; tags?: unknown; events?: unknown };
type StepId = 'understand' | 'classify' | 'collect' | 'write' | 'check' | 'retry' | 'recheck' | 'result';
type StepStatus = 'start' | 'done' | 'failed';

const LABEL: Record<StepId, string> = {
  understand: 'Understanding the question',
  classify: 'Deciding what kind of question it is',
  collect: 'Collecting the data',
  write: 'Writing the answer',
  check: 'Checking the numbers',
  retry: 'Rewriting the answer with the corrections',
  recheck: 'Checking the numbers again',
  result: 'Result',
};

/** "move M0165 · store Lucknow · LKO-01 · product Ivory Chikankari Kurta Set (M) · KUR-04-M", or nothing. */
function aboutWords(m: MovesFile, a: About): string {
  const style = new Map(m.moves.map((mv) => [mv.style_id, mv.style_name]));
  const prod = (id: string) => {
    if (style.has(id)) return `${style.get(id)} · ${id}`;
    const mv = m.moves.find((x) => x.sku_id === id);
    return mv ? `${mv.style_name} (${id.slice(mv.style_id.length + 1)}) · ${id}` : id;
  };
  const store = (id: string) => {
    const city = m.stores.find((s) => s.store_id === id)?.city;
    return id === 'WH-KOL' ? 'warehouse WH-KOL' : city ? `store ${city} · ${id}` : `store ${id}`;
  };
  const parts = [...a.moves.map((id) => `move ${id}`), ...a.stores.map(store), ...a.skus.map((id) => `product ${prod(id)}`)];
  return parts.length ? parts.slice(0, 6).join(', ') + (parts.length > 6 ? ` and ${parts.length - 6} more` : '') : 'No store, product or move named';
}

/**
 * POST /api/chat
 * Request: { question, history, tags?: { stores?, skus?, moves? }, events?: true }.
 * Without `events` (older screens): text/plain answer chunks, then "\n" + one JSON line {done:true, …}, as before.
 * With `events: true` (Ask v2): application/x-ndjson, one JSON object per line:
 *   {"type":"step","id","status":"start"|"done"|"failed","label","detail"?}  the pipeline's own progress
 *   {"type":"text","delta","reset"?}                                         answer text (reset = clear what came before)
 *   {"type":"done","done":true, …}                                           the final line, same fields as the old one plus:
 * Final fields: numbers_found, numbers_total, result, held_reason?, text? (REPLACES everything streamed), about,
 * suggestions (2-3 template follow-ups, after every answer), mode ('DATA'|'GENERAL'|'MIXED'), kinds, run_id, as_of.
 */
@Controller('chat')
export class ChatController {
  constructor(
    private readonly runs: RunsService,
    private readonly mesh: MeshClient,
    private readonly aiLog: AiLogService,
  ) {}

  @Post()
  @HttpCode(200)
  async chat(@ReqScope() scope: Scope, @Body() body: ChatBody, @Res() res: Response) {
    const question = typeof body?.question === 'string' ? body.question.trim() : '';
    if (!question || question.length > MAX_QUESTION) {
      throw new BadRequestException({ error: `question must be 1-${MAX_QUESTION} characters` });
    }
    const history: Turn[] = (Array.isArray(body.history) ? body.history : [])
      .filter((t): t is Turn => !!t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string')
      .slice(-MAX_TURNS)
      .map((t) => ({ role: t.role, content: t.content.slice(0, MAX_QUESTION) }));
    const events = body.events === true;

    res.status(200);
    res.setHeader('Content-Type', events ? 'application/x-ndjson; charset=utf-8' : 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.socket?.setNoDelay(true); // each event goes out as soon as it is written
    const line = (o: object) => res.write(JSON.stringify(o) + '\n');
    const step = (id: StepId, status: StepStatus, detail?: string) => {
      if (events) line({ type: 'step', id, status, label: LABEL[id], ...(detail ? { detail } : {}) });
    };
    const text = (delta: string, reset = false) => (events ? line({ type: 'text', delta, ...(reset ? { reset: true } : {}) }) : res.write(delta));
    const finish = (extra: Record<string, unknown>) => {
      if (events) line({ type: 'done', done: true, ...extra });
      else res.write('\n' + JSON.stringify({ done: true, ...extra }) + '\n');
      res.end();
    };

    step('understand', 'start');
    const run = await this.runs.latest(scope);
    const loc = scopeLocation(scope);
    if (!run) {
      step('understand', 'failed', 'There is no run yet');
      text('There is no run yet, so there is nothing to answer from.');
      return finish({ numbers_found: 0, numbers_total: 0, result: 'ERROR', held_reason: 'MODEL_ERROR' });
    }
    const m = run.moves;
    const started = Date.now();
    // `m` and `run.history` are already the scoped view (#77): recognition, tags, context, checks and suggestions see only it.
    const about = recognise(m, question, cleanTags(m, body.tags));
    step('understand', 'done', aboutWords(m, about));

    step('classify', 'start');
    const prevQ = [...history].reverse().find((t) => t.role === 'user')?.content;
    const plan: Plan = classify(question, about, prevQ, prevQ ? recognise(m, prevQ) : undefined);
    step('classify', 'done', `${planWords(plan)} (${plan.why})`);
    const has = (k: Plan['kinds'][number]) => plan.kinds.includes(k);

    const meta = { about, mode: plan.mode, kinds: plan.kinds, run_id: m.run.run_id, as_of: m.run.as_of };
    const base = { run_id: m.run.run_id, job: 'ASK' as const, model: this.mesh.model, input_summary: ((loc ? `location ${loc}: ` : '') + question).slice(0, 300) };
    const log = (mode: Mode, c: Omit<AiCall, 'id' | 'at' | 'run_id' | 'job' | 'model' | 'input_summary' | 'latency_ms' | 'mode'>) =>
      this.aiLog.add({ ...base, ...c, mode, latency_ms: Date.now() - started });
    const follow = (answer: string) => followUps(m, about, { question, answer, kinds: plan.kinds, history: run.history });

    if (!this.mesh.available) {
      step('write', 'failed', 'The AI service is not set up');
      text(UNAVAILABLE);
      await log(plan.mode, { output: 'MESH_API_KEY not set', numbers_found: 0, numbers_total: 0, result: 'ERROR', held_reason: 'MODEL_ERROR' });
      step('result', 'failed', 'Not answered: the AI service is not available');
      return finish({ ...meta, numbers_found: 0, numbers_total: 0, result: 'ERROR', held_reason: 'MODEL_ERROR', suggestions: follow('') });
    }

    // ---- Collect: only what this kind of question needs ----
    step('collect', 'start');
    const collected: string[] = [];
    const sections: Record<string, unknown> = {};
    const wider: LineSource[] = [];
    let ctx: Record<string, unknown> = {};
    if (has('TODAY')) {
      ctx = chatContext(m, question, about) as Record<string, unknown>;
      const focus = [about.moves.length && `${about.moves.length} move${about.moves.length > 1 ? 's' : ''}`, about.stores.length && `${about.stores.length} place${about.stores.length > 1 ? 's' : ''}`, about.skus.length && `${about.skus.length} product${about.skus.length > 1 ? 's' : ''}`].filter(Boolean).join(', ');
      collected.push(`Today's list: ${m.summary.moves} moves, ${m.stores.length} store${m.stores.length === 1 ? '' : 's'}, ${m.problems.length} problems${focus ? `; full detail for ${focus}` : ''}`);
    } else if (plan.mode !== 'GENERAL') {
      ctx = { run: { run_id: m.run.run_id, as_of: m.run.as_of, next_run_at: m.run.next_run_at }, summary: m.summary };
      collected.push("Today's totals only");
    }
    if (has('HISTORY')) {
      const h = historyData(run.history, m, about);
      sections.history = h.ctx;
      wider.push(h.source);
      collected.push(h.detail);
    }
    if (has('RUNS')) {
      const r = runsData(await this.runs.list().catch(() => []), loc, m.run.next_run_at);
      sections.past_runs = r.ctx;
      wider.push(r.source);
      collected.push(r.detail);
    }
    if (has('RULES')) {
      const r = rulesData();
      sections.rules = r;
      wider.push(rulesSource(r));
      collected.push('The rules, lead times, minimum display and settings');
    }
    if (plan.mode === 'GENERAL') collected.push('None of your data: a general question gets no store data');
    step('collect', 'done', collected.join('; '));

    // The base context feeds the old checks unchanged; wider sections are checked per entity / week by `wider`.
    const allowed = new AllowedSet(ctx, [m.run.as_of, TODAY], m, { question, about }, wider);
    const data = { ...ctx, ...sections };
    const system = plan.mode === 'GENERAL'
      ? GENERAL_RULES
      : [
          SYSTEM_RULES, CHAT_RULES, loc ? scopeRule(loc) : '',
          sections.history ? WIDER_RULES.history : '', sections.past_runs ? WIDER_RULES.runs : '', sections.rules ? WIDER_RULES.rules : '',
          has('FORECAST') ? FORECAST_RULE : has('GENERAL') ? MIXED_RULE : '',
          `\nDATA (today = ${TODAY}, as of ${m.run.as_of}):\n${JSON.stringify(data)}`,
        ].filter(Boolean).join('\n');
    const messages: ChatMessage[] = [{ role: 'system', content: system }, ...history, { role: 'user', content: question }];

    const check = (answer: string) => checkAnswer(answer, { plan, m, question, allowed, wider });
    const short = (g: GroundingResult) => g.missing.slice(0, 3).join('; ') + (g.missing.length > 3 ? ` and ${g.missing.length - 3} more` : '');
    const checkedWords = (g: AnswerCheck) =>
      plan.mode === 'GENERAL' && !g.generalLeak ? 'No figures about your stores, products or moves'
        : g.total ? `${g.found} of ${g.total} numbers checked against your data` : 'No numbers to check';

    let tokensIn = 0;
    let tokensOut = 0;
    try {
      step('write', 'start', plan.mode === 'GENERAL' ? 'From general knowledge' : 'From the data collected');
      let out = await this.mesh.stream(messages, (d) => text(d));
      tokensIn += out.tokens_in ?? 0;
      tokensOut += out.tokens_out ?? 0;
      step('write', 'done', `${out.text.split(/\s+/).filter(Boolean).length} words`);
      step('check', 'start', plan.mode === 'GENERAL' ? 'Looking for figures about your stores, products or moves' : undefined);
      let g = check(out.text);
      let replaced = false;
      if (!g.ok) {
        step('check', 'failed', `${g.found} of ${g.total} checked. Could not check: ${short(g)}`);
        step('retry', 'start', 'One more try, told exactly which figures were wrong');
        if (events) text('', true);
        const fix = plan.mode === 'GENERAL' ? generalCorrection(g.missing) : correction(g.missing);
        out = await this.mesh.complete([...messages, { role: 'assistant', content: out.text }, { role: 'user', content: fix }]);
        tokensIn += out.tokens_in ?? 0;
        tokensOut += out.tokens_out ?? 0;
        step('retry', 'done', `${out.text.split(/\s+/).filter(Boolean).length} words`);
        step('recheck', 'start');
        g = check(out.text);
        replaced = true;
        step('recheck', g.ok ? 'done' : 'failed', g.ok ? checkedWords(g) : `${g.found} of ${g.total} checked. Still could not check: ${short(g)}`);
      } else {
        step('check', 'done', checkedWords(g));
      }
      const usage = { tokens_in: tokensIn, tokens_out: tokensOut };
      // A general answer whose figures were checked is no longer purely general.
      const mode: Mode = plan.mode === 'GENERAL' && g.generalLeak ? 'MIXED' : plan.mode;
      if (!g.ok) {
        const held = plan.mode === 'GENERAL' ? HELD_GENERAL : HELD;
        await log(mode, { ...usage, output: out.text, numbers_found: g.found, numbers_total: g.total, result: 'HELD_BACK', held_reason: 'UNGROUNDED_NUMBER' });
        step('result', 'failed', 'Held back: a figure could not be checked, so the answer is not shown');
        return finish({ ...meta, mode, numbers_found: g.found, numbers_total: g.total, result: 'HELD_BACK', held_reason: 'UNGROUNDED_NUMBER', text: held, suggestions: follow('') });
      }
      await log(mode, { ...usage, output: out.text, numbers_found: g.found, numbers_total: g.total, result: 'SHOWN' });
      step('result', 'done', mode === 'GENERAL' ? 'Shown, labelled as a general answer' : mode === 'MIXED' ? 'Shown: the data part checked, the general part labelled' : 'Shown');
      return finish({ ...meta, mode, numbers_found: g.found, numbers_total: g.total, result: 'SHOWN', ...(replaced ? { text: out.text } : {}), suggestions: follow(out.text) });
    } catch (e) {
      await log(plan.mode, { output: (e as Error).message.slice(0, 300), numbers_found: 0, numbers_total: 0, result: 'ERROR', held_reason: 'MODEL_ERROR' });
      step('write', 'failed', 'The AI service did not answer');
      step('result', 'failed', 'Not answered');
      text(UNAVAILABLE, true);
      return finish({ ...meta, numbers_found: 0, numbers_total: 0, result: 'ERROR', held_reason: 'MODEL_ERROR', text: UNAVAILABLE, suggestions: follow('') });
    }
  }
}
