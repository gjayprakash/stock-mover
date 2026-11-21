import type { AiCall, MovesFile } from '@sm/contract';

/** DATA = checked against your data; GENERAL = general knowledge, labelled; MIXED = both (Ask v2). */
export type ChatMode = NonNullable<AiCall['mode']>;

/** Final line of POST /api/chat (apps/api/src/ai/chat.controller.ts). Fields after `suggestions` come from Ask v2 servers only. */
export type ChatFinal = {
  done: true;
  numbers_found: number;
  numbers_total: number;
  result: AiCall['result'];
  held_reason?: AiCall['held_reason'];
  /** When present it REPLACES everything streamed before. */
  text?: string;
  /** What the server understood the question to be about (newer servers only). */
  about?: About;
  /** Questions to ask next (newer servers only; Ask v2 sends 2-3 after every answer). */
  suggestions?: string[];
  mode?: ChatMode;
  kinds?: string[];
  run_id?: string;
  as_of?: string;
};

/** One stage of the server's own pipeline (not the model's reasoning). */
export type ChatStep = { id: string; status: 'start' | 'done' | 'failed'; label: string; detail?: string };

/** Exact ids the user tagged; sent as `tags` (at most 5 in total). */
export type ChatTags = { stores?: string[]; skus?: string[]; moves?: string[] };
export type About = { stores: string[]; skus: string[]; moves: string[] };

export type Turn = { role: 'user' | 'assistant'; content: string };

export const UNAVAILABLE = 'Ask is not available right now. Everything else works.';
export const MAX_QUESTION = 2000;
const MAX_TURNS = 6;
const TIMEOUT_MS = 60_000;
const DONE_MARK = '\n{"done"';

/** Old format: streamed text without the final JSON line (or a partial start of it). */
function visibleText(buf: string): string {
  const i = buf.lastIndexOf(DONE_MARK);
  if (i >= 0) return buf.slice(0, i);
  const nl = buf.lastIndexOf('\n');
  if (nl >= 0 && DONE_MARK.startsWith(buf.slice(nl))) return buf.slice(0, nl);
  return buf;
}

export type AskResult = { text: string; final: ChatFinal | null; practice: boolean; steps: ChatStep[] };
export type AskHandlers = { onText: (text: string) => void; onSteps?: (steps: ChatStep[]) => void };

/** Steps keep their first-seen order; a later event for the same id updates it in place. */
function upsert(steps: ChatStep[], s: ChatStep): ChatStep[] {
  const i = steps.findIndex((x) => x.id === s.id);
  if (i < 0) return [...steps, s];
  const next = steps.slice();
  next[i] = { ...steps[i], ...s, detail: s.detail ?? steps[i].detail };
  return next;
}

/**
 * POST /api/chat {question, history, tags?, events: true} and stream the answer.
 * Ask v2 server: application/x-ndjson events (step / text / done). Older server: text/plain chunks, then
 * "\n" + one JSON line; both are read here, so the screen works against either.
 * Dev only: if the API is not running, a fake stream built from the moves file stands in.
 */
export async function askChat(
  question: string,
  history: Turn[],
  on: AskHandlers,
  movesFile: MovesFile | null,
  tags?: ChatTags,
): Promise<AskResult> {
  const hasTags = !!tags && Object.values(tags).some((v) => v && v.length > 0);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let practice = false;
  let steps: ChatStep[] = [];
  try {
    let res: Response | null = null;
    try {
      res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history: history.slice(-MAX_TURNS), ...(hasTags ? { tags } : {}), events: true }),
        signal: ctrl.signal,
      });
    } catch {
      res = null;
    }
    const unreachable = !res || res.status === 404 || res.status >= 500 || !res.body;
    if (unreachable && import.meta.env.DEV && movesFile) {
      const { fakeChatResponse } = await import('./fakeStream');
      res = fakeChatResponse(question, movesFile, hasTags ? tags : undefined);
      practice = true;
    }
    if (!res || !res.ok || !res.body) return { text: UNAVAILABLE, final: null, practice, steps };

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    const events = (res.headers.get('Content-Type') ?? '').includes('ndjson');

    if (events) {
      let buf = '';
      let text = '';
      let final: ChatFinal | null = null;
      const take = (raw: string) => {
        if (!raw.trim()) return;
        let e: { type?: string } & Record<string, unknown>;
        try { e = JSON.parse(raw); } catch { return; }
        if (e.type === 'step') {
          steps = upsert(steps, e as unknown as ChatStep);
          on.onSteps?.(steps);
        } else if (e.type === 'text') {
          text = (e.reset ? '' : text) + String(e.delta ?? '');
          on.onText(text);
        } else if (e.type === 'done') {
          const { type: _t, ...rest } = e;
          final = rest as unknown as ChatFinal;
        }
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        lines.forEach(take);
      }
      take(buf + dec.decode());
      if (!final) return { text: text || UNAVAILABLE, final: null, practice, steps };
      const f = final as ChatFinal;
      return { text: f.text ?? text, final: f, practice, steps };
    }

    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      on.onText(visibleText(buf));
    }
    buf += dec.decode();
    const i = buf.lastIndexOf(DONE_MARK);
    if (i < 0) return { text: UNAVAILABLE, final: null, practice, steps };
    let final: ChatFinal;
    try {
      final = JSON.parse(buf.slice(i + 1).trim()) as ChatFinal;
    } catch {
      return { text: UNAVAILABLE, final: null, practice, steps };
    }
    return { text: final.text ?? buf.slice(0, i), final, practice, steps };
  } catch {
    return { text: UNAVAILABLE, final: null, practice, steps };
  } finally {
    clearTimeout(timer);
  }
}
