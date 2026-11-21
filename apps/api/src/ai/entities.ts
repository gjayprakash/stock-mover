import type { HistoryFile, MovesFile } from '@sm/contract';
import type { Kind } from './classify';
import { storeFlows } from './context';

/** Every entity the server recognised in a question (tags included). `skus` holds SKU ids and style ids. */
export type About = { stores: string[]; skus: string[]; moves: string[] };
export type Tags = { stores?: string[]; skus?: string[]; moves?: string[] };

export const MAX_TAGS = 5;
const WAREHOUSE = 'WH-KOL';
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Tags from the request body: exact ids from today's list only, at most MAX_TAGS in total. */
export function cleanTags(m: MovesFile, raw: unknown): About {
  const t = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const stores = new Set([WAREHOUSE, ...m.stores.map((s) => s.store_id)]);
  const skus = new Set(m.moves.flatMap((mv) => [mv.sku_id, mv.style_id]));
  const moves = new Set(m.moves.map((mv) => mv.id));
  let left = MAX_TAGS;
  const take = (ids: string[], ok: Set<string>) => [...new Set(ids)].filter((id) => ok.has(id) && left-- > 0);
  return { stores: take(list(t.stores), stores), moves: take(list(t.moves), moves), skus: take(list(t.skus), skus) };
}

/**
 * Forgiving recognition of ids typed in a question (#13). Only ids that exist in today's list are accepted.
 * - moves: "M0165", "mo165" (o for 0), "m165", "M 0165", "move 165"
 * - stores: "LKO-01", "lko1", "LKO 01", "warehouse" → WH-KOL, a city name → that city's stores
 * - products: SKU / style ids in any case, with or without hyphens ("kur04l", "KUR-04")
 */
export function recognise(m: MovesFile, question: string, tags: About = { stores: [], skus: [], moves: [] }): About {
  const q = question.toLowerCase();
  const moves = new Set(tags.moves);
  const stores = new Set(tags.stores);
  const skus = new Set(tags.skus);

  const moveIds = new Set(m.moves.map((mv) => mv.id));
  for (const [, num] of q.matchAll(/(?<![\w'’])(?:move|m)\s*#?\s*([0-9o]{1,5})\b/g)) {
    if (!/\d/.test(num)) continue;
    const id = 'M' + String(parseInt(num.replace(/o/g, '0'), 10)).padStart(4, '0');
    if (moveIds.has(id)) moves.add(id);
  }

  const storeIds = new Set(m.stores.map((s) => s.store_id));
  for (const [, letters, num] of q.matchAll(/\b([a-z]{3})[\s-]?0*(\d{1,2})\b/g)) {
    const id = `${letters.toUpperCase()}-${num.padStart(2, '0')}`;
    if (storeIds.has(id)) stores.add(id);
  }
  if (/\b(warehouse|wh[\s-]?kol)\b/.test(q)) stores.add(WAREHOUSE);
  // A city adds its stores only when none of that city's stores was named by id ("Lucknow LKO-04" = LKO-04 only).
  const named = new Set([...stores].map((id) => m.stores.find((s) => s.store_id === id)?.city));
  for (const s of m.stores) {
    if (s.city && !named.has(s.city) && new RegExp(`\\b${s.city.toLowerCase()}\\b`).test(q)) stores.add(s.store_id);
  }

  const skuByKey = new Map(m.moves.map((mv) => [key(mv.sku_id), mv.sku_id]));
  const styleByKey = new Map(m.moves.map((mv) => [key(mv.style_id), mv.style_id]));
  for (const [tok, style] of q.matchAll(/\b([a-z]{2,4}[\s-]?\d{2})(?:[\s-]?[a-z0-9]{1,4})?\b/g)) {
    const hit = skuByKey.get(key(tok)) ?? styleByKey.get(key(style));
    if (hit) skus.add(hit);
  }
  return { stores: [...stores], skus: [...skus], moves: [...moves] };
}

export const isEmpty = (a: About) => !a.stores.length && !a.skus.length && !a.moves.length;

/**
 * Up to 4 follow-up questions, built from templates and the data (never by the model). Each one is answerable
 * from the chat context: about the recognised entities when there are any, otherwise general ones.
 */
export function suggestions(m: MovesFile, about: About): string[] {
  const out: string[] = [];
  for (const id of about.moves) {
    const mv = m.moves.find((x) => x.id === id)!;
    out.push(`Why is ${id} moving?`, `When will ${id} arrive?`, `Does ${id} need sign-off?`, `What does ${mv.to} have after ${id}?`);
  }
  for (const id of about.stores) {
    out.push(`What arrives at ${id} and from where?`, `What does ${id} send out, and where to?`);
    if (id !== WAREHOUSE) out.push(`Is ${id} below minimum display in any category?`);
  }
  for (const id of about.skus) {
    out.push(`Where is ${id} moving today, and why?`, `Which stores send ${id} back to the warehouse?`);
  }
  if (!out.length) {
    const top = [...m.problems].sort((a, b) => a.rank - b.rank)[0];
    if (top) out.push(`What is behind "${top.title}"?`);
    // Only stores of this (possibly scoped, #77) file, never a counterparty store outside the scope.
    const own = new Set(m.stores.map((s) => s.store_id));
    const most = storeFlows(m).filter((f) => own.has(f.store)).sort((a, b) => b.in_pieces - a.in_pieces)[0];
    if (most && most.in_pieces > 0) out.push(`What arrives at ${most.store} and from where?`);
    out.push('Which moves need my sign-off?', 'Which moves send stock back to the warehouse?');
  }
  return [...new Set(out)].slice(0, 4);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Ask v2: two or three follow-up questions after every answer, from templates and the entities in the question and
 * the answer (never written by the model). Each is answerable: it names only ids in this (scoped) file, and the
 * history question is offered only when history exists for that store or product.
 */
export function followUps(
  m: MovesFile,
  about: About,
  o: { question: string; answer: string; kinds: Kind[]; history?: HistoryFile },
): string[] {
  const moveIds = new Set(m.moves.map((mv) => mv.id));
  const storeIds = new Set([WAREHOUSE, ...m.stores.map((s) => s.store_id)]);
  const skuIds = new Set(m.moves.flatMap((mv) => [mv.sku_id, mv.style_id]));
  const inAnswer = [...new Set(o.answer.match(/\b(?:M\d{4}|[A-Z]{2,4}-\d{2}(?:-[A-Z0-9]+)?|WH-KOL)\b/g) ?? [])];
  // From the answer only its first move: a long list would otherwise fill every slot with "Why is M000x moving?".
  const moves = [...new Set([...about.moves, ...inAnswer.filter((x) => moveIds.has(x)).slice(0, 1)])];
  // The warehouse is on most moves: only when the question named it.
  const stores = [...new Set([...about.stores, ...inAnswer.filter((x) => storeIds.has(x) && x !== WAREHOUSE)])];
  const skus = [...new Set([...about.skus, ...inAnswer.filter((x) => skuIds.has(x) && !storeIds.has(x))])];
  const hKeys = Object.keys(o.history ?? {});
  const hasHistory = (store?: string, sku?: string) =>
    hKeys.some((k) => { const [s, p] = k.split('|'); return (!store || s === store) && (!sku || p === sku || p.startsWith(sku + '-')); });
  // One list per entity, so the picks below rotate between entities instead of asking three things about one.
  const groups: string[][] = [];
  for (const id of moves.slice(0, 3)) {
    const mv = m.moves.find((x) => x.id === id)!;
    groups.push([`Why is ${id} moving?`, `When will ${id} arrive?`, `Does ${id} need sign-off?`, `What does ${mv.to} have after ${id}?`]);
  }
  for (const id of stores.slice(0, 3)) {
    const g = [`What arrives at ${id} and from where?`];
    if (id !== WAREHOUSE && hasHistory(id)) g.push(`How did ${id} sell over the last 12 weeks?`);
    g.push(`What does ${id} send out, and where to?`);
    if (id !== WAREHOUSE) g.push(`Is ${id} below minimum display in any category?`);
    groups.push(g);
  }
  for (const id of skus.slice(0, 3)) {
    const g = [`Where is ${id} moving today, and why?`];
    if (hasHistory(undefined, id)) g.push(`How did ${id} sell over the last 12 weeks?`);
    g.push(`Which stores send ${id} back to the warehouse?`);
    groups.push(g);
  }
  const k = new Set(o.kinds);
  if (k.has('RULES')) groups.push(['What are the lead times between stores?', 'Why not take stock from the flagship stores?']);
  if (k.has('RUNS')) groups.push(['When did the list last run, and how many moves did it have?']);
  if (k.has('HISTORY') && !moves.length && !stores.length && !skus.length && hKeys.length) groups.push(['Which stores sold the most over the last 12 weeks?']);
  const asked = norm(o.question);
  // Always at least two: top up with the general questions (top problem, busiest store, sign-off, pull backs).
  if (groups.flat().filter((g) => norm(g) !== asked).length < 2) groups.push(suggestions(m, { stores: [], skus: [], moves: [] }));
  const out: string[] = [];
  for (let i = 0; out.length < 3 && groups.some((g) => g.length > i); i++) {
    for (const g of groups) if (g[i] && norm(g[i]) !== asked && !out.includes(g[i]) && out.length < 3) out.push(g[i]);
  }
  return out;
}
