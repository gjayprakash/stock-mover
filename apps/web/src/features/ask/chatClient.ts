import type { AiCall, MovesFile } from '@sm/contract';

/** Final JSON line of POST /api/chat (apps/api/src/ai/chat.controller.ts). */
export type ChatFinal = {
  done: true;
  numbers_found: number;
  numbers_total: number;
  result: AiCall['result'];
  held_reason?: AiCall['held_reason'];
  /** When present it REPLACES everything streamed before. */
  text?: string;
};

export type Turn = { role: 'user' | 'assistant'; content: string };

export const UNAVAILABLE = 'Ask is not available right now. Everything else works.';
export const MAX_QUESTION = 2000;
const MAX_TURNS = 6;
const TIMEOUT_MS = 45_000;
const DONE_MARK = '\n{"done"';

/** Streamed text without the final JSON line (or a partial start of it). */
function visibleText(buf: string): string {
  const i = buf.lastIndexOf(DONE_MARK);
  if (i >= 0) return buf.slice(0, i);
  const nl = buf.lastIndexOf('\n');
  if (nl >= 0 && DONE_MARK.startsWith(buf.slice(nl))) return buf.slice(0, nl);
  return buf;
}

export type AskResult = { text: string; final: ChatFinal | null; practice: boolean };

/**
 * POST /api/chat {question, history} and stream the answer.
 * Body: text/plain chunks, then "\n" + one JSON line (ChatFinal).
 * Dev only: if the API is not running, a fake stream built from the moves file stands in.
 */
export async function askChat(
  question: string,
  history: Turn[],
  onText: (text: string) => void,
  movesFile: MovesFile | null,
): Promise<AskResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let practice = false;
  try {
    let res: Response | null = null;
    try {
      res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history: history.slice(-MAX_TURNS) }),
        signal: ctrl.signal,
      });
    } catch {
      res = null;
    }
    const unreachable = !res || res.status === 404 || res.status >= 500 || !res.body;
    if (unreachable && import.meta.env.DEV && movesFile) {
      const { fakeChatResponse } = await import('./fakeStream');
      res = fakeChatResponse(question, movesFile);
      practice = true;
    }
    if (!res || !res.ok || !res.body) return { text: UNAVAILABLE, final: null, practice };

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      onText(visibleText(buf));
    }
    buf += dec.decode();
    const i = buf.lastIndexOf(DONE_MARK);
    if (i < 0) return { text: UNAVAILABLE, final: null, practice };
    let final: ChatFinal;
    try {
      final = JSON.parse(buf.slice(i + 1).trim()) as ChatFinal;
    } catch {
      return { text: UNAVAILABLE, final: null, practice };
    }
    return { text: final.text ?? buf.slice(0, i), final, practice };
  } catch {
    return { text: UNAVAILABLE, final: null, practice };
  } finally {
    clearTimeout(timer);
  }
}
