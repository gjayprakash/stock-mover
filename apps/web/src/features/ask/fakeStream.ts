import type { MovesFile } from '@sm/contract';
import { UNAVAILABLE, type About, type ChatFinal, type ChatTags } from './chatClient';
import { suggestions as generalSuggestions } from './parts';

/**
 * DEV ONLY. Stands in for POST /api/chat when the API is not running on this machine, so the
 * streaming, status line, held-back and failure states can be seen. Same wire format as the real
 * endpoint: text chunks, then "\n" + one JSON line. Every number comes from the moves file.
 * Words in the question pick the case: "forecast"/"predict" → held back, "invent" → ungrounded
 * number replaced, "fail" → model error. A question about a move id (also "mo165" → M0165), a store
 * or a tag gets an answer; a question with nothing to go on → "not in today's data" + suggestions.
 */
export function fakeChatResponse(question: string, m: MovesFile, tags?: ChatTags): Response {
  const q = question.toLowerCase();
  // "mo165", "m165", "M0165" → M0165
  const moveIds = [...q.matchAll(/\bmo?\s?0*(\d{1,4})\b/g)].map((x) => `M${x[1].padStart(4, '0')}`);
  const about: About = {
    moves: [...new Set([...(tags?.moves ?? []), ...moveIds.filter((id) => m.moves.some((mv) => mv.id === id))])],
    stores: [...new Set([...(tags?.stores ?? []), ...m.stores.filter((s) => q.includes(s.store_id.toLowerCase())).map((s) => s.store_id)])],
    skus: [...new Set([...(tags?.skus ?? []), ...m.moves.filter((mv) => q.includes(mv.sku_id.toLowerCase())).map((mv) => mv.sku_id)])],
  };
  const cityStore = m.stores.find((s) => q.includes(s.city.toLowerCase()));
  if (!about.stores.length && cityStore) about.stores.push(cityStore.store_id);

  let text: string;
  let final: Omit<ChatFinal, 'done'>;
  const move = m.moves.find((mv) => mv.id === about.moves[0]);
  const store = m.stores.find((s) => s.store_id === about.stores[0]);
  const sku = about.skus[0];

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
  } else if (move) {
    text = `${move.id} sends ${move.qty} pieces of ${move.sku_id} from ${move.from} to ${move.to}. ${move.reason}`;
    final = { numbers_found: 1, numbers_total: 1, result: 'SHOWN', about };
  } else if (store) {
    const ids = m.moves.filter((mv) => mv.to === store.store_id || mv.from === store.store_id).map((mv) => mv.id);
    text = `${store.city} ${store.store_id} gets ${store.in_units} pieces and sends ${store.out_units} today. ` +
      (ids.length ? `The moves are ${ids.slice(0, 4).join(', ')}.` : 'It has no moves today.');
    final = { numbers_found: 2, numbers_total: 2, result: 'SHOWN', about };
  } else if (sku) {
    const ids = m.moves.filter((mv) => mv.sku_id === sku).map((mv) => `${mv.id} (${mv.from} to ${mv.to})`);
    text = ids.length ? `${sku} moves today in ${ids.join(', ')}.` : `${sku} has no moves today.`;
    final = { numbers_found: 0, numbers_total: 0, result: 'SHOWN', about };
  } else if (/sign|list|today|flagship|warehouse|urgent|tell me more/.test(q)) {
    const top = [...m.moves].sort((a, b) => b.priority - a.priority)[0];
    const signoff = m.moves.filter((mv) => mv.needs_signoff).map((mv) => mv.id);
    text = `Today's list has ${m.summary.moves} moves, ${m.summary.units} pieces in all.` +
      (top ? ` The most urgent is ${top.id}: ${top.qty} pieces of ${top.sku_id} from ${top.from} to ${top.to}.` : '') +
      (signoff.length ? ` These need your sign-off: ${signoff.join(', ')}.` : '');
    final = { numbers_found: top ? 3 : 2, numbers_total: top ? 3 : 2, result: 'SHOWN' };
  } else {
    // Nothing to go on (or a move id that is not on today's list).
    text = "That is not in today's data.";
    const top = [...m.moves].sort((a, b) => b.priority - a.priority)[0];
    final = {
      numbers_found: 0, numbers_total: 0, result: 'SHOWN', about,
      suggestions: [
        ...(top ? [`Why was ${top.id} suggested?`] : []),
        ...generalSuggestions(m).slice(0, 3),
      ],
    };
  }

  // "old server" in the question → behave like a server from before `about`/`suggestions` existed.
  if (q.includes('old server')) final = { ...final, about: undefined, suggestions: undefined };

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
