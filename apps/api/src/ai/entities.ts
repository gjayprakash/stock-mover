import type { MovesFile } from '@sm/contract';
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
    const most = storeFlows(m).filter((f) => f.store !== WAREHOUSE).sort((a, b) => b.in_pieces - a.in_pieces)[0];
    if (most && most.in_pieces > 0) out.push(`What arrives at ${most.store} and from where?`);
    out.push('Which moves need my sign-off?', 'Which moves send stock back to the warehouse?');
  }
  return [...new Set(out)].slice(0, 4);
}
