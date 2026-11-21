import type { MovesFile } from '@sm/contract';
import { UNAVAILABLE, type ChatFinal } from './chatClient';

/**
 * DEV ONLY. Stands in for POST /api/chat when the API is not running on this machine, so the
 * streaming, status line, held-back and failure states can be seen. Same wire format as the real
 * endpoint: text chunks, then "\n" + one JSON line. Every number comes from the moves file.
 * Words in the question pick the case: "forecast"/"predict" → held back, "invent" → ungrounded
 * number replaced, "fail" → model error. Anything else → a normal answer.
 */
export function fakeChatResponse(question: string, m: MovesFile): Response {
  const q = question.toLowerCase();
  const store =
    m.stores.find((s) => q.includes(s.store_id.toLowerCase())) ?? m.stores.find((s) => q.includes(s.city.toLowerCase()));
  let text: string;
  let final: Omit<ChatFinal, 'done'>;

  if (/forecast|predict|next year/.test(q)) {
    text = `Stock Mover does not forecast. What today's data has: sales up to ${m.run.as_of}, ${m.summary.moves} moves on today's list and ${m.summary.stores_at_risk} stores at risk. Ask about any of those.`;
    final = { numbers_found: 0, numbers_total: 0, result: 'HELD_BACK', held_reason: 'FORECAST_REQUEST' };
  } else if (q.includes('fail')) {
    text = UNAVAILABLE;
    final = { numbers_found: 0, numbers_total: 0, result: 'ERROR', held_reason: 'MODEL_ERROR', text: UNAVAILABLE };
  } else if (q.includes('invent')) {
    text = `Sales will rise by ${m.summary.units + 17} pieces next month.`;
    final = {
      numbers_found: 0, numbers_total: 1, result: 'HELD_BACK', held_reason: 'UNGROUNDED_NUMBER',
      text: `That is not in today's data. What it does have: ${m.summary.moves} moves on today's list (as of ${m.run.as_of}). Try naming a store, SKU or style.`,
    };
  } else if (store) {
    const ids = m.moves.filter((mv) => mv.to === store.store_id || mv.from === store.store_id).map((mv) => mv.id);
    text = `${store.city} ${store.store_id} gets ${store.in_units} pieces and sends ${store.out_units} today. ` +
      (ids.length ? `The moves are ${ids.slice(0, 4).join(', ')}.` : 'It has no moves today.');
    final = { numbers_found: 2, numbers_total: 2, result: 'SHOWN' };
  } else {
    const top = [...m.moves].sort((a, b) => b.priority - a.priority)[0];
    const signoff = m.moves.filter((mv) => mv.needs_signoff).map((mv) => mv.id);
    text = `Today's list has ${m.summary.moves} moves, ${m.summary.units} pieces in all.` +
      (top ? ` The most urgent is ${top.id}: ${top.qty} pieces of ${top.sku_id} from ${top.from} to ${top.to}.` : '') +
      (signoff.length ? ` These need your sign-off: ${signoff.join(', ')}.` : '');
    final = { numbers_found: top ? 3 : 2, numbers_total: top ? 3 : 2, result: 'SHOWN' };
  }

  const words = text.split(/(?<= )/);
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      await sleep(600);
      for (let i = 0; i < words.length; i += 2) {
        ctrl.enqueue(enc.encode(words.slice(i, i + 2).join('')));
        await sleep(70);
      }
      ctrl.enqueue(enc.encode('\n' + JSON.stringify({ done: true, ...final }) + '\n'));
      ctrl.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
