import { BadRequestException, Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { AiCall, Scope } from '@sm/contract';
import { ReqScope } from '../auth/scope';
import { scopeLocation } from '../runs/scoped';
import { RunsService, TODAY } from '../runs/runs.service';
import { AiLogService } from './ai-log.service';
import { chatContext } from './context';
import { cleanTags, recognise, suggestions } from './entities';
import { AllowedSet, isForecastRequest } from './grounding';
import { MeshClient, type ChatMessage } from './mesh.client';
import { CHAT_RULES, SYSTEM_RULES, correction, scopeRule } from './prompts';

const MAX_QUESTION = 2000;
const MAX_TURNS = 6;
const UNAVAILABLE = 'Ask is not available right now. Everything else works.';

type Turn = { role: 'user' | 'assistant'; content: string };
type ChatBody = { question?: unknown; history?: unknown; tags?: unknown };

/**
 * POST /api/chat → text/plain stream of answer chunks, then a newline and one JSON line:
 * {"done":true,"numbers_found":n,"numbers_total":n,"result":"SHOWN"|"HELD_BACK"|"ERROR","held_reason"?,"text"?}
 * When "text" is present it REPLACES everything streamed before (grounding failed or retry fixed it).
 * Request may carry tags: { stores?, skus?, moves? } (exact ids, max 5). The final line also carries
 * about: { stores, skus, moves } (everything recognised, tags included) and, when the answer is a refusal or
 * held back, suggestions: up to 4 template questions the context can answer (#13).
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

    res.status(200);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const write = (s: string) => res.write(s);
    const finish = (extra: Record<string, unknown>) => {
      write('\n' + JSON.stringify({ done: true, ...extra }) + '\n');
      res.end();
    };

    const run = await this.runs.latest(scope);
    const loc = scopeLocation(scope);
    if (!run) {
      write('There is no run yet, so there is nothing to answer from.');
      return finish({ numbers_found: 0, numbers_total: 0, result: 'ERROR', held_reason: 'MODEL_ERROR' });
    }
    const m = run.moves;
    const started = Date.now();
    // `m` is already the scoped file (#77), so recognition, tags, focus, checks and suggestions only see this scope.
    const about = recognise(m, question, cleanTags(m, body.tags));
    // Every final line says what was recognised; refusals and held-back answers also get follow-up questions.
    const finishAbout = (extra: Record<string, unknown>, suggest = false) =>
      finish({ ...extra, about, ...(suggest ? { suggestions: suggestions(m, about) } : {}) });
    const base = { run_id: m.run.run_id, job: 'ASK' as const, model: this.mesh.model, input_summary: ((loc ? `location ${loc}: ` : '') + question).slice(0, 300) };
    const log = (c: Omit<AiCall, 'id' | 'at' | 'run_id' | 'job' | 'model' | 'input_summary' | 'latency_ms'>) =>
      this.aiLog.add({ ...base, ...c, latency_ms: Date.now() - started });

    if (isForecastRequest(question)) {
      const text =
        `Stock Mover does not forecast. What today's data has: sales up to ${m.run.as_of}, ` +
        `${m.summary.moves} moves on today's list and ${m.summary.stores_at_risk} stores at risk. Ask about any of those.`;
      write(text);
      await log({ output: text, numbers_found: 0, numbers_total: 0, result: 'HELD_BACK', held_reason: 'FORECAST_REQUEST' });
      return finishAbout({ numbers_found: 0, numbers_total: 0, result: 'HELD_BACK', held_reason: 'FORECAST_REQUEST' }, true);
    }

    if (!this.mesh.available) {
      write(UNAVAILABLE);
      await log({ output: 'MESH_API_KEY not set', numbers_found: 0, numbers_total: 0, result: 'ERROR', held_reason: 'MODEL_ERROR' });
      return finishAbout({ numbers_found: 0, numbers_total: 0, result: 'ERROR', held_reason: 'MODEL_ERROR' });
    }

    const ctx = chatContext(m, question, about);
    const allowed = new AllowedSet(ctx, [m.run.as_of, TODAY], m);
    const messages: ChatMessage[] = [
      { role: 'system', content: `${SYSTEM_RULES}\n${CHAT_RULES}${loc ? '\n' + scopeRule(loc) : ''}\n\nTODAY'S DATA (as of ${m.run.as_of}):\n${JSON.stringify(ctx)}` },
      ...history,
      { role: 'user', content: question },
    ];
    let tokensIn = 0;
    let tokensOut = 0;
    try {
      let out = await this.mesh.stream(messages, write);
      tokensIn += out.tokens_in ?? 0;
      tokensOut += out.tokens_out ?? 0;
      let g = allowed.check(out.text);
      let replaced = false;
      if (!g.ok) {
        out = await this.mesh.complete([...messages, { role: 'assistant', content: out.text }, { role: 'user', content: correction(g.missing) }]);
        tokensIn += out.tokens_in ?? 0;
        tokensOut += out.tokens_out ?? 0;
        g = allowed.check(out.text);
        replaced = true;
      }
      const usage = { tokens_in: tokensIn, tokens_out: tokensOut };
      if (!g.ok) {
        const text = `That is not in today's data. What it does have: ${m.summary.moves} moves on today's list (as of ${m.run.as_of}). Try one of the questions below, or tag a store, product or move.`;
        await log({ ...usage, output: out.text, numbers_found: g.found, numbers_total: g.total, result: 'HELD_BACK', held_reason: 'UNGROUNDED_NUMBER' });
        return finishAbout({ numbers_found: g.found, numbers_total: g.total, result: 'HELD_BACK', held_reason: 'UNGROUNDED_NUMBER', text }, true);
      }
      await log({ ...usage, output: out.text, numbers_found: g.found, numbers_total: g.total, result: 'SHOWN' });
      const refused = /not in today'?s data/i.test(out.text);
      return finishAbout({ numbers_found: g.found, numbers_total: g.total, result: 'SHOWN', ...(replaced ? { text: out.text } : {}) }, refused);
    } catch (e) {
      await log({ output: (e as Error).message.slice(0, 300), numbers_found: 0, numbers_total: 0, result: 'ERROR', held_reason: 'MODEL_ERROR' });
      write(UNAVAILABLE);
      return finishAbout({ numbers_found: 0, numbers_total: 0, result: 'ERROR', held_reason: 'MODEL_ERROR', text: UNAVAILABLE });
    }
  }
}
