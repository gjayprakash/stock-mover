import type { MovesFile } from '@sm/contract';
import { UNAVAILABLE, type About, type ChatFinal, type ChatTags } from './chatClient';
import { suggestions as generalSuggestions } from './parts';

/**
 * DEV ONLY. Stands in for POST /api/chat when the API is not running on this machine, so the steps, streaming,
 * labels, held-back and failure states can be seen. Same wire format as the real endpoint with `events: true`
 * (NDJSON step / text / done events); "old server" in the question replays the old text/plain format.
 * Every number comes from the moves file. Words in the question pick the case:
 * - "fail" → model error; "invent" → held back after a failed retry; "retry" → first draft fails, retry passes
 * - "forecast" / "predict" / "next month" → past trend + outlook in words (mixed)
 * - "mean" / "how do i" / "weather" / "tips" / "practice" / nothing recognised → general answer
 * - "what is a pull back" → mixed (data part + general part)
 * - a move id ("mo165" → M0165), a store id or city, a SKU, or a tag → data answer about it
 */
export function fakeChatResponse(question: string, m: MovesFile, tags?: ChatTags): Response {
  const q = question.toLowerCase();
  const moveIds = [...q.matchAll(/\bmo?\s?0*(\d{1,4})\b/g)].map((x) => `M${x[1].padStart(4, '0')}`);
  const about: About = {
    moves: [...new Set([...(tags?.moves ?? []), ...moveIds.filter((id) => m.moves.some((mv) => mv.id === id))])],
    stores: [...new Set([...(tags?.stores ?? []), ...m.stores.filter((s) => q.includes(s.store_id.toLowerCase())).map((s) => s.store_id)])],
    skus: [...new Set([...(tags?.skus ?? []), ...m.moves.filter((mv) => q.includes(mv.sku_id.toLowerCase())).map((mv) => mv.sku_id)])],
  };
  const cityStore = m.stores.find((s) => q.includes(s.city.toLowerCase()));
  if (!about.stores.length && cityStore) about.stores.push(cityStore.store_id);

  const move = m.moves.find((mv) => mv.id === about.moves[0]);
  const store = m.stores.find((s) => s.store_id === about.stores[0]);
  const sku = about.skus[0];
  const named = !!(move || store || sku);
  const top = [...m.moves].sort((a, b) => b.priority - a.priority)[0];
  const pullBacks = m.moves.filter((mv) => mv.type === 'PULL_BACK');
  const signoff = m.moves.filter((mv) => mv.needs_signoff);

  type Step = { id: string; status: 'start' | 'done' | 'failed'; label: string; detail?: string };
  const S = (id: string, status: Step['status'], label: string, detail?: string): Step => ({ id, status, label, ...(detail ? { detail } : {}) });
  const understood = [
    ...about.moves.map((id) => `move ${id}`),
    ...about.stores.map((id) => `store ${m.stores.find((s) => s.store_id === id)?.city ?? ''} · ${id}`),
    ...about.skus.map((id) => `product ${id}`),
  ].join(', ') || 'No store, product or move named';
  const listDetail = `Today's list: ${m.summary.moves} moves, ${m.stores.length} stores, ${m.problems.length} problems`;

  let kind = 'DATA';
  let classify = "About today's list";
  let collect = listDetail;
  let text: string;
  let retryText: string | null = null;
  let checkFail: string | null = null;
  let recheckFail = false;
  let final: Omit<ChatFinal, 'done'>;
  const follow: string[] = [];

  if (q.includes('fail')) {
    kind = 'ERROR';
    text = UNAVAILABLE;
    final = { numbers_found: 0, numbers_total: 0, result: 'ERROR', held_reason: 'MODEL_ERROR', text: UNAVAILABLE, mode: 'DATA' };
  } else if (/forecast|predict|next month|next season/.test(q)) {
    kind = 'MIXED';
    classify = "About the last 12 weeks of sales and stock. Forecast: no future numbers, outlook in words only (asks about the future)";
    collect = `${listDetail}; 12-week totals for all store and product pairs on the list`;
    text = `Over the last 12 weeks the list's ${m.summary.moves} moves come from stores whose recent weeks sold more than the first weeks.\n` +
      `**In general:**\nWedding-season demand usually holds into the next weeks, so stock that sold well recently may keep selling. This is not a forecast.`;
    final = { numbers_found: 1, numbers_total: 1, result: 'SHOWN', mode: 'MIXED', kinds: ['TODAY', 'HISTORY', 'FORECAST'] };
    follow.push('Which stores sold the most over the last 12 weeks?', 'Which moves need my sign-off?');
  } else if (/what is a pull ?back/.test(q)) {
    kind = 'MIXED';
    classify = "About today's list, plus a general part (uses words about today's list; has a general part)";
    text = `${pullBacks.length} moves send stock back to the warehouse today: ${pullBacks.slice(0, 5).map((mv) => mv.id).join(', ')}${pullBacks.length > 5 ? ' and more' : ''}.\n` +
      `**In general:**\nA pull back returns slow or ageing stock to the warehouse so it can be sent where it sells.`;
    final = { numbers_found: 1, numbers_total: 1, result: 'SHOWN', mode: 'MIXED', kinds: ['TODAY', 'GENERAL'] };
    follow.push('Which moves send stock back to the warehouse?', 'Why not take stock from the flagship stores?');
  } else if (!named && /\bmean\b|how do i|how to|weather|tips|practice|haiku|thanks|hello|screen|export/.test(q) || (!named && !/sign|list|today|flagship|warehouse|urgent|tell me more|move|store|stock|invent|retry/.test(q))) {
    kind = 'GENERAL';
    classify = 'General question: answered from general knowledge, not your data';
    collect = 'None of your data: a general question gets no store data';
    text = /export/.test(q)
      ? 'Open **All moves**, approve the moves you want, then press **Export approved CSV**. The file has one line per approved move.'
      : 'Sell-through is the share of the stock a store received that it sold in a period.\n- High sell-through means the product is moving well.\n- Low sell-through can mean too much stock, or the wrong place for it.';
    final = { numbers_found: 0, numbers_total: 0, result: 'SHOWN', mode: 'GENERAL', kinds: ['GENERAL'] };
    follow.push(...generalSuggestions(m).slice(0, 3));
  } else if (q.includes('invent')) {
    text = `Sales will rise by ${m.summary.units + 17} pieces next month across ${m.stores.length} stores.`;
    checkFail = `0 of 2 checked. Could not check: ${m.summary.units + 17}`;
    retryText = `Sales went up by ${m.summary.units + 9} pieces.`;
    recheckFail = true;
    final = {
      numbers_found: 0, numbers_total: 1, result: 'HELD_BACK', held_reason: 'UNGROUNDED_NUMBER', mode: 'DATA', kinds: ['TODAY'],
      text: 'The answer had a number that could not be checked against your data, so it is not shown. Try one of the questions below.',
    };
    follow.push('Which moves need my sign-off?', ...(top ? [`Why is ${top.id} moving?`] : []));
  } else if (move) {
    text = `**Move**: ${move.id} sends ${move.qty} pieces of ${move.sku_id} from ${move.from} to ${move.to}.\n` +
      `**Reason for Move**: ${move.reason}\n\n` +
      `**What changes**:\n- ${move.from} gives the pieces\n- ${move.to} receives them on ${move.arrives_on}`;
    collect = `${listDetail}; full detail for 1 move`;
    if (q.includes('retry')) {
      checkFail = `2 of 3 checked. Could not check: date 11-9 for ${move.id}`;
      retryText = text;
      text = text.replace(move.arrives_on, '2026-11-09');
    }
    final = { numbers_found: 3, numbers_total: 3, result: 'SHOWN', about, mode: 'DATA', kinds: ['TODAY'], ...(retryText ? { text: retryText } : {}) };
    follow.push(`When will ${move.id} arrive?`, `What arrives at ${move.to} and from where?`, `Does ${move.id} need sign-off?`);
  } else if (store) {
    const ids = m.moves.filter((mv) => mv.to === store.store_id || mv.from === store.store_id).map((mv) => mv.id);
    text = `${store.city} ${store.store_id} gets ${store.in_units} pieces and sends ${store.out_units} today.` +
      (ids.length ? `\n- The moves are ${ids.slice(0, 4).join(', ')}${ids.length > 4 ? ` and ${ids.length - 4} more` : ''}.` : '\nIt has no moves today.');
    collect = `${listDetail}; full detail for 1 place`;
    final = { numbers_found: 2, numbers_total: 2, result: 'SHOWN', about, mode: 'DATA', kinds: ['TODAY'] };
    follow.push(`What arrives at ${store.store_id} and from where?`, `How did ${store.store_id} sell over the last 12 weeks?`, `Is ${store.store_id} below minimum display in any category?`);
  } else if (sku) {
    const ids = m.moves.filter((mv) => mv.sku_id === sku).map((mv) => `${mv.id} (${mv.from} to ${mv.to})`);
    text = ids.length ? `${sku} moves today in ${ids.join(', ')}.` : `${sku} has no moves today.`;
    final = { numbers_found: 0, numbers_total: 0, result: 'SHOWN', about, mode: 'DATA', kinds: ['TODAY'] };
    follow.push(`Where is ${sku} moving today, and why?`, `How did ${sku} sell over the last 12 weeks?`);
  } else {
    text = `Today's list has ${m.summary.moves} moves, ${m.summary.units} pieces in all.` +
      (top ? ` The most urgent is ${top.id}: ${top.qty} pieces of ${top.sku_id} from ${top.from} to ${top.to}.` : '') +
      (signoff.length ? `\nThese need your sign-off: ${signoff.map((mv) => mv.id).join(', ')}.` : '');
    final = { numbers_found: top ? 3 : 2, numbers_total: top ? 3 : 2, result: 'SHOWN', mode: 'DATA', kinds: ['TODAY'] };
    if (top) follow.push(`Why is ${top.id} moving?`);
    follow.push('Which moves send stock back to the warehouse?', 'What are the lead times between stores?');
  }
  final = { ...final, suggestions: follow.slice(0, 3), run_id: m.run.run_id, as_of: m.run.as_of };

  const enc = new TextEncoder();
  // "old server" → the pre-v2 wire format: text chunks, then "\n" + one JSON line, no steps / mode / follow-ups.
  if (q.includes('old server')) {
    const old = { ...final, about: undefined, suggestions: undefined, mode: undefined, kinds: undefined };
    const words = (old.text ?? text).split(/(?<= )/);
    const body = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        await sleep(600);
        for (let i = 0; i < words.length; i += 2) { ctrl.enqueue(enc.encode(words.slice(i, i + 2).join(''))); await sleep(70); }
        ctrl.enqueue(enc.encode('\n' + JSON.stringify({ done: true, ...old }) + '\n'));
        ctrl.close();
      },
    });
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  const body = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const send = (o: object) => ctrl.enqueue(enc.encode(JSON.stringify(o) + '\n'));
      const step = async (s: Step, wait: number) => { send({ type: 'step', ...s }); await sleep(wait); };
      const stream = async (t: string) => {
        const words = t.split(/(?<= )/);
        for (let i = 0; i < words.length; i += 2) { send({ type: 'text', delta: words.slice(i, i + 2).join('') }); await sleep(60); }
      };
      await step(S('understand', 'start', 'Understanding the question'), 350);
      await step(S('understand', 'done', 'Understanding the question', understood), 250);
      await step(S('classify', 'start', 'Deciding what kind of question it is'), 300);
      await step(S('classify', 'done', 'Deciding what kind of question it is', classify), 250);
      if (kind === 'ERROR') {
        await step(S('write', 'failed', 'Writing the answer', 'The AI service did not answer'), 200);
        await step(S('result', 'failed', 'Result', 'Not answered'), 100);
        send({ type: 'text', delta: UNAVAILABLE, reset: true });
        send({ type: 'done', done: true, ...final });
        ctrl.close();
        return;
      }
      await step(S('collect', 'start', 'Collecting the data'), 450);
      await step(S('collect', 'done', 'Collecting the data', collect), 250);
      await step(S('write', 'start', 'Writing the answer', kind === 'GENERAL' ? 'From general knowledge' : 'From the data collected'), 500);
      await stream(text);
      await step(S('write', 'done', 'Writing the answer', `${text.split(/\s+/).length} words`), 200);
      await step(S('check', 'start', 'Checking the numbers', kind === 'GENERAL' ? 'Looking for figures about your stores, products or moves' : undefined), 600);
      if (checkFail) {
        await step(S('check', 'failed', 'Checking the numbers', checkFail), 300);
        await step(S('retry', 'start', 'Rewriting the answer with the corrections', 'One more try, told exactly which figures were wrong'), 0);
        send({ type: 'text', delta: '', reset: true });
        await sleep(1400);
        await step(S('retry', 'done', 'Rewriting the answer with the corrections', `${(retryText ?? '').split(/\s+/).length} words`), 200);
        await step(S('recheck', 'start', 'Checking the numbers again'), 500);
        await step(recheckFail
          ? S('recheck', 'failed', 'Checking the numbers again', `0 of 1 checked. Still could not check: ${m.summary.units + 9}`)
          : S('recheck', 'done', 'Checking the numbers again', `${final.numbers_found} of ${final.numbers_total} numbers checked against your data`), 200);
      } else {
        await step(S('check', 'done', 'Checking the numbers', kind === 'GENERAL' ? 'No figures about your stores, products or moves'
          : final.numbers_total ? `${final.numbers_found} of ${final.numbers_total} numbers checked against your data` : 'No numbers to check'), 200);
      }
      const held = final.result === 'HELD_BACK';
      await step(S('result', held ? 'failed' : 'done', 'Result', held ? 'Held back: a figure could not be checked, so the answer is not shown'
        : kind === 'GENERAL' ? 'Shown, labelled as a general answer' : kind === 'MIXED' ? 'Shown: the data part checked, the general part labelled' : 'Shown'), 100);
      send({ type: 'done', done: true, ...final });
      ctrl.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
