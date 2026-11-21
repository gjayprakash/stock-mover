// Grounding check: every number and date in an AI answer must come from the data we sent.
// Allowed = every number/date in the context (+ fixed rule numbers). A number also passes if it is a
// rounding of an allowed number, or the sum/difference of two allowed numbers (ASSUMPTION, issue #10).

import type { Move, MoveType, MovesFile, StoreSummary } from '@sm/contract';
import { focusOn, storeFlows, type PlaceShare, type StoreFlow } from './context';
import type { About } from './entities';

const MONTHS =['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})(?:T[\d:.+Z-]*)?\b/g;
const DAY_MON = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON}(?:\\s+(\\d{4}))?`, 'gi');
const MON_DAY = new RegExp(`\\b${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, 'gi');
// Codes carry digits that are not quantities: LKO-01, KUR-12-XL, MOJ-02-9, WH-KOL, run-2026..., M0001, P1.
const CODES = /\b(?:[A-Z]{2,4}-\d{2}(?:-[A-Z0-9]+)?|WH-KOL|run-[\w]+|M\d{4}|P\d{1,2}|S\+\+|S\+)/g;
const NUMBER = /\d+(?:,\d+)*(?:\.\d+)?/g;

// Numbers in the five rules / product that the model may quote without them being in the JSON.
const RULE_NUMBERS = [30, 20, 100000, 60, 12, 5]; // cover days, top-20, sign-off ₹, new-store days, weeks shown, rules

export type GroundingResult = { found: number; total: number; missing: string[]; ok: boolean };

/**
 * Ask v2: a wider data source (12-week history, past runs, rules). For a line it applies to, it returns the numbers
 * and dates that line may also use (only the named entity's / week's own values); null when the line is not about it.
 * Its values never go into the whole-context set, so lines about today's list are checked exactly as before.
 * `only`: on such a line the loose whole-context rule (any number in the context, or a sum of two) no longer applies;
 * the line may use the source's values plus, if it names one move or one store, that entity's own data.
 */
export type LineSource = { lineSet(line: string): { set: NumberSet; only: boolean } | null };

const md = (m: number, d: number) => `${m}-${d}`;

export function datesIn(text: string): { keys: string[]; rest: string } {
  const keys: string[] = [];
  let rest = text.replace(ISO_DATE, (_, _y, m, d) => (keys.push(md(+m, +d)), ' '));
  rest = rest.replace(DAY_MON, (_, d, mon) => (keys.push(md(MONTHS.indexOf(mon.slice(0, 3).toLowerCase()) + 1, +d)), ' '));
  rest = rest.replace(MON_DAY, (_, mon, d) => (keys.push(md(MONTHS.indexOf(mon.slice(0, 3).toLowerCase()) + 1, +d)), ' '));
  return { keys, rest };
}

export function numbersIn(text: string): number[] {
  return (text.replace(CODES, ' ').match(NUMBER) ?? []).map((n) => Number(n.replace(/,/g, '')));
}

/** Numbers and dates that may be quoted. `derived` also accepts the sum/difference of two members. */
export class NumberSet {
  readonly nums = new Set<number>();
  readonly dates = new Set<string>();

  constructor(private readonly derived: boolean, ...values: unknown[]) {
    RULE_NUMBERS.forEach((n) => this.addNumber(n));
    values.forEach((v) => this.walk(v));
  }

  /** A set holding only these values: no rule numbers (for history and run figures, which belong to one entity). */
  static plain(...values: unknown[]): NumberSet {
    const s = new NumberSet(false);
    s.nums.clear();
    values.forEach((v) => s.walk(v));
    return s;
  }

  private addNumber(n: number) {
    if (!Number.isFinite(n)) return;
    this.nums.add(n);
    this.nums.add(Math.round(n));
    this.nums.add(Math.round(n * 10) / 10);
    this.nums.add(Math.abs(n));
  }

  private addText(s: string) {
    const { keys, rest } = datesIn(s);
    keys.forEach((k) => this.dates.add(k));
    numbersIn(rest).forEach((n) => this.addNumber(n));
  }

  private walk(v: unknown) {
    if (typeof v === 'number') this.addNumber(v);
    else if (typeof v === 'string') this.addText(v);
    else if (Array.isArray(v)) v.forEach((x) => this.walk(x));
    else if (v && typeof v === 'object') Object.values(v).forEach((x) => this.walk(x));
  }

  hasNumber(x: number) {
    if (this.nums.has(x)) return true;
    if (!this.derived) return false;
    for (const a of this.nums) if (this.nums.has(x - a) || this.nums.has(a - x)) return true;
    return false;
  }
}

const NO_NUMBERS = NumberSet.plain();

// What a line says about a move's direction, checked against the move's `type`.
const TYPE_CLAIMS: [MoveType, RegExp][] = [
  ['PULL_BACK', /\b(back to (the )?(warehouse|WH-KOL)|pull[- ]?backs?|return(s|ed|ing)? (\w+ )?to (the )?(warehouse|WH-KOL)|to the warehouse)\b/i],
  ['WH_TO_STORE', /\b(from (the )?(warehouse|WH-KOL)|warehouse[- ]to[- ]stores?)\b/i],
  ['STORE_TO_STORE', /\b(store[- ]to[- ]store|between (two )?stores|from one store to another)\b/i],
];
// Plain words for messages that go back to the model (it must not echo internal codes).
const TYPE_WORDS: Record<MoveType, string> = {
  PULL_BACK: 'back to the warehouse', WH_TO_STORE: 'warehouse to store', STORE_TO_STORE: 'store to store',
};

/** Numbers around each mention of `place`: from the previous place code to the next one (dates and codes removed). */
function placeWindows(text: string, place: string): number[][] {
  const hits = [...text.matchAll(CODE)];
  return hits.flatMap((h, i) => {
    if (h[0] !== place) return [];
    const start = i > 0 ? hits[i - 1].index! + hits[i - 1][0].length : 0;
    const end = i + 1 < hits.length ? hits[i + 1].index! : text.length;
    return [numbersIn(datesIn(text.slice(start, h.index!) + ' ' + text.slice(h.index! + h[0].length, end)).rest)];
  });
}

const typeClaim = (s: string): MoveType | null => {
  const hits = TYPE_CLAIMS.filter(([, re]) => re.test(s)).map(([t]) => t);
  return hits.length === 1 ? hits[0] : null;
};
export const MOVE_ID = /\bM\d{4}\b/g;
export const CODE = /\b(?:[A-Z]{2,4}-\d{2}(?:-[A-Z0-9]+)?|WH-KOL)\b/g;
const LIST_MARKER = /^\s*(?:\d{1,3}[.)]|[-*•])\s+/;

/**
 * Lines of the answer. A line naming several moves is split into sentences so each can be tied to one move;
 * a line naming one move stays whole, so a number in its second sentence is still checked against that move.
 */
function segments(answer: string): string[] {
  return answer
    .split(/\n+/)
    .map((l) => l.replace(LIST_MARKER, '').trim())
    .filter(Boolean)
    .flatMap((l) => (new Set(l.match(MOVE_ID) ?? []).size > 1 ? l.split(/(?<=[.!?;])\s+/) : [l]));
}

/**
 * Grounding check. Every number and date in the answer must be in the data sent to the model (+ rule numbers),
 * or a rounding / sum / difference of two such numbers. When the moves file is given, it is also entity-aware (#18):
 * - a line that names exactly one move may only use that move's own numbers and dates (plus run totals and rule
 *   numbers, no sums), may only name that move's stores, and any warehouse / store-to-store claim (on the line, or in
 *   the heading line above a list) must match the move's type;
 * - a line that names exactly one store and no move or product may only use that store's numbers;
 * - other lines keep the whole-context rule.
 */
export class AllowedSet {
  private readonly global: NumberSet;
  private readonly runTotals: unknown[];
  private readonly moves = new Map<string, Move>();
  private readonly stores = new Map<string, StoreSummary>();
  private readonly cache = new Map<string, NumberSet>();
  private flows?: Map<string, StoreFlow>;
  // #13: what the focus section gave the model for each tagged / recognised entity (record, problem, flags...).
  private readonly focus = new Map<string, unknown>();
  private readonly soleFocus: string | null = null;

  constructor(
    context: unknown,
    private readonly extraDates: string[] = [],
    private readonly file?: MovesFile,
    private readonly ask?: { question: string; about: About },
    private readonly wider: LineSource[] = [],
    /** Exact numbers only (no sums): for figures in a general answer, where the model had no data to quote. */
    exact = false,
  ) {
    this.global = new NumberSet(!exact, context, extraDates);
    file?.moves.forEach((mv) => this.moves.set(mv.id, mv));
    file?.stores.forEach((s) => this.stores.set(s.store_id, s));
    const tally = (mvs: Move[]) => [mvs.length, mvs.reduce((t, x) => t + x.qty, 0), mvs.reduce((t, x) => t + x.value_inr, 0)];
    this.runTotals = file
      ? [file.summary, file.blocked, file.run.as_of, extraDates,
          [...new Set(file.moves.map((x) => x.type))].map((t) => tally(file.moves.filter((x) => x.type === t))),
          // Per trigger only the count: its pieces / value are rarely quoted on a one-entity line and too easily collide.
          [...new Set(file.moves.map((x) => x.trigger))].map((t) => file.moves.filter((x) => x.trigger === t).length),
          tally(file.moves.filter((x) => x.needs_signoff))]
      : [];
    if (file && ask) {
      const f = focusOn(file, ask.about);
      f.moves.forEach((e) => this.focus.set(e.move.id, e));
      f.stores.forEach((e, i) => this.focus.set(ask.about.stores[i], e));
      f.products.forEach((e) => this.focus.set(e.product, e));
      if (this.focus.size === 1) this.soleFocus = [...this.focus.keys()][0];
    }
  }

  /** A cached NumberSet (no sums) for a key, built from the given values plus run totals. */
  private setOf(k: string, values: () => unknown[]) {
    if (!this.cache.has(k)) this.cache.set(k, new NumberSet(false, ...values(), this.runTotals));
    return this.cache.get(k)!;
  }

  /** A store's own data: summary, in/out totals and breakdowns, its moves' dates, and its focus entry if any. */
  private storeValues(id: string): unknown[] {
    const mvs = this.file!.moves.filter((x) => x.from === id || x.to === id);
    return [this.stores.get(id) ?? null, this.flowMap().get(id) ?? null, mvs.map((x) => x.arrives_on), this.focus.get(id) ?? null];
  }

  /** A move's own data; for a focus move also its problem and the flags shown with it. */
  private moveSet(mv: Move) {
    return this.setOf(`m:${mv.id}`, () => [mv, this.focus.get(mv.id) ?? null]);
  }

  private flowMap() {
    if (!this.flows) this.flows = new Map(storeFlows(this.file!).map((f) => [f.store, f]));
    return this.flows;
  }

  /**
   * A store line's allowed numbers (breakdowns let "LKO-02: 4 pieces to MZF-01" pass). With exactly one focus
   * entity, its data counts too, so a number that belongs to the focus is not failed on another entity's line.
   */
  private storeSet(id: string) {
    const sole = this.soleFocus && this.soleFocus !== id ? this.soleFocus : null;
    return this.setOf(`s:${id}|${sole ?? ''}`, () => [...this.storeValues(id), sole ? this.focus.get(sole) : null]);
  }

  /**
   * Completeness of a store breakdown (#18: MZF-01 got 128 pieces from 5 places, the answer listed 4 adding to 124).
   * If the answer states one place's incoming (or outgoing) total and lists at least 2 of its sources (destinations),
   * each listed place must carry its own pieces, and the listed places must add up to the total
   * (or the rest must be stated as "other").
   */
  private breakdownCheck(answer: string): { total: number; missing: string[] } {
    const flows = this.flowMap();
    const places = [...new Set(answer.match(CODE) ?? [])].filter((c) => flows.has(c));
    const nums = new Set(numbersIn(datesIn(answer).rest));
    let best: { subject: string; dir: 'in' | 'out'; parts: PlaceShare[]; sum: number; named: PlaceShare[] } | null = null;
    for (const subject of places) {
      const f = flows.get(subject)!;
      for (const dir of ['in', 'out'] as const) {
        const parts = dir === 'in' ? f.in_from : f.out_to;
        const sum = dir === 'in' ? f.in_pieces : f.out_pieces;
        const named = parts.filter((p) => p.place !== subject && places.includes(p.place));
        if (parts.length < 2 || named.length < 2 || !nums.has(sum)) continue;
        if (!best || named.length > best.named.length) best = { subject, dir, parts, sum, named };
      }
    }
    if (!best) return { total: 0, missing: [] };
    const { subject, dir, parts, sum, named } = best;
    const missing: string[] = [];
    const arrow = (p: PlaceShare) => (dir === 'in' ? `${p.place} → ${subject}` : `${subject} → ${p.place}`);
    for (const p of named) {
      if (!placeWindows(answer, p.place).some((w) => w.includes(p.pieces))) missing.push(`${arrow(p)} is ${p.pieces} pieces`);
    }
    const listed = named.reduce((t, p) => t + p.pieces, 0);
    const others = /\bother/i.test(answer) && nums.has(sum - listed);
    if (listed !== sum && !others) {
      const absent = parts.filter((p) => !named.includes(p));
      missing.push(
        `${subject} ${dir === 'in' ? 'receives' : 'sends'} ${sum} pieces but the listed ${dir === 'in' ? 'sources' : 'destinations'} ` +
          `add up to ${listed}; missing: ${absent.map((p) => `${p.place} ${p.pieces} pieces`).join(', ')}`,
      );
    }
    return { total: named.length + 1, missing };
  }

  check(answer: string): GroundingResult {
    const missing: string[] = [];
    let total = 0;
    let listClaim: MoveType | null = null;   // set by a heading line ("these go back to the warehouse:")
    let heading: Move | null = null;          // focus move named by an earlier line ("For move M0165, …:")
    for (const seg of this.file ? segments(answer) : [answer]) {
      const ids = [...new Set(seg.match(MOVE_ID) ?? [])].filter((id) => this.moves.has(id));
      if (ids.length) heading = ids.length === 1 && this.focus.has(ids[0]) ? this.moves.get(ids[0])! : null;
      const codes = [...new Set(seg.match(CODE) ?? [])];
      const storeCodes = codes.filter((c) => c === 'WH-KOL' || this.stores.has(c));
      const claim = typeClaim(seg);
      const namesProblem = /\bP\d{1,2}\b/.test(seg);   // a move + its problem = several entities → whole-context rule
      let set = this.global;
      let about = '';
      if (this.file && ids.length === 1 && !namesProblem) {
        const mv = this.moves.get(ids[0])!;
        set = this.moveSet(mv);
        about = ` for ${mv.id}`;
        const ok = new Set([mv.from, mv.to, ...mv.alternatives.map((a) => a.store_id)]);
        for (const s of storeCodes) {
          total++;
          if (!ok.has(s)) missing.push(`${s} is not part of ${mv.id} (${mv.from} → ${mv.to})`);
        }
        // Direction words: "from X" / "out of X" / "X →" must be the move's from; "to X" / "into X" / "→ X" its to.
        for (const h of seg.matchAll(CODE)) {
          const role = roleAt(seg, h.index!, h[0]);
          if (!role || !ok.has(h[0]) || mv.alternatives.some((a) => a.store_id === h[0])) continue;
          total++;
          const want = role === 'from' ? mv.from : mv.to;
          if (h[0] !== want) missing.push(`${mv.id} goes from ${mv.from} to ${mv.to}, not ${role} ${h[0]}`);
        }
        const said = claim ?? listClaim;
        if (said) {
          total++;
          if (said !== mv.type) missing.push(`${mv.id} goes ${TYPE_WORDS[mv.type]}, not ${TYPE_WORDS[said]}`);
        }
      } else {
        if (ids.length === 0) listClaim = claim;
        // A line under a focus move's heading is about that move: its own data, plus any store the move does not touch.
        const own = heading ? new Set([heading.from, heading.to, heading.sku_id, heading.style_id]) : null;
        const extra = own ? codes.filter((c) => !own.has(c)) : [];
        if (heading && ids.length === 0 && extra.every((c) => this.stores.has(c) || c === 'WH-KOL')) {
          const mv = heading;
          set = this.setOf(`h:${mv.id}|${extra.join(',')}`, () => [mv, this.focus.get(mv.id), ...extra.flatMap((c) => this.storeValues(c))]);
          about = ` for ${mv.id}`;
        } else if (this.file && ids.length === 0 && !namesProblem && storeCodes.length === 1 && codes.length === 1 && storeCodes[0] !== 'WH-KOL') {
          set = this.storeSet(storeCodes[0]);
          about = ` for ${storeCodes[0]}`;
        }
      }
      const { keys, rest } = datesIn(seg);
      // Ask v2: history / runs / rules values this line may also use (none unless the question needed that source).
      const hits = this.wider.map((w) => w.lineSet(seg)).filter((x): x is { set: NumberSet; only: boolean } => !!x);
      const more = hits.map((x) => x.set);
      if (set === this.global && hits.some((x) => x.only)) set = NO_NUMBERS;
      for (const k of keys) {
        total++;
        if (!set.dates.has(k) && !more.some((x) => x.dates.has(k))) missing.push(`date ${k}${about}`);
      }
      for (const n of numbersIn(rest)) {
        total++;
        if (!set.hasNumber(n) && !more.some((x) => x.hasNumber(n))) missing.push(`${n}${about}`);
      }
    }
    if (this.file && this.ask) {
      const l = listCheck(this.file, this.ask.question, this.ask.about, answer);
      total += l.total;
      missing.push(...l.missing);
    }
    if (this.file) {
      // Lines that name a move are already checked against that move; a breakdown is about places only.
      const b = this.breakdownCheck(answer.split('\n').filter((l) => !/\bM\d{4}\b/.test(l)).join('\n'));
      total += b.total;
      missing.push(...b.missing);
    }
    return { found: total - missing.length, total, missing, ok: missing.length === 0 };
  }
}

// Forecast check (#18): any future-tense question about demand. Dates already in the data (arrivals,
// stock after a move) must still be answered, so future words alone do not count: they need a demand word,
// or a "will ... go up / drop" verb in a question that is not about stock, cover or a move.
const FORECAST_WORD = /\b(forecast\w*|predict\w*|projection\w*|projected)\b/i;
const DEMAND = /\b(sales?(?! at risk)|sell\w*|sold|demand|revenue|turnover|footfall)\b/i;
const FUTURE = /\b(will|won't|going to|gonna|next (week|month|quarter|season|year)|coming (weeks?|months?|season)|upcoming|expect\w*|anticipat\w*|outlook|future|later this (month|year|season))\b/i;
const WILL_CHANGE = /\b(will|going to)\b[^?.!]{0,60}\b(sell|go (up|down)|increase|decrease|drop|rise|grow|fall|pick up|improve|decline|slow down)\b/i;
const ABOUT_DATA = /\b(stock|cover|on hand|pieces|units|move|moves|M\d{4}|arrive\w*|after)\b/i;
export const isForecastRequest = (q: string) =>
  FORECAST_WORD.test(q) || (DEMAND.test(q) && FUTURE.test(q)) || (WILL_CHANGE.test(q) && !ABOUT_DATA.test(q));

/** Role of a store code at `index` in a line about one move: 'from', 'to' or null when no direction word is next to it. */
function roleAt(line: string, index: number, code: string): 'from' | 'to' | null {
  const before = line.slice(0, index);
  const after = line.slice(index + code.length);
  if (/→\s*$/.test(before) || /\b(to|into|arrives? (at|in)|arriving (at|in)|reach(es)?|for)\s*$/i.test(before)) return 'to';
  if (/^\s*→/.test(after) || /\b(from|out of|leaves|leaving)\s*$/i.test(before)) return 'from';
  return null;
}

/** Where a single store sits in the question: moves INTO it or OUT of it. */
function storeRole(q: string, m: MovesFile, id: string): 'in' | 'out' | null {
  const city = m.stores.find((s) => s.store_id === id)?.city?.toLowerCase();
  const forms = [id.toLowerCase(), id.toLowerCase().replace('-', ''), id.toLowerCase().replace('-', ' '), city]
    .filter((f): f is string => !!f);
  const at = Math.min(...forms.map((f) => q.indexOf(f)).filter((i) => i >= 0));
  if (Number.isFinite(at)) {
    const before = q.slice(Math.max(0, at - 30), at);
    if (/\b(into|in to|to|at|arriv\w*|reach\w*|receiv\w*|for)\s*$/.test(before)) return 'in';
    if (/\b(from|out of|leav\w*|by)\s*$/.test(before)) return 'out';
  }
  if (/\b(send|sends|sent|sending|outgoing|leav\w*|out of|going out)\b/.test(q)) return 'out';
  if (/\b(arriv\w*|receiv\w*|incoming|get|gets|getting|coming in|going in(to)?|into)\b/.test(q)) return 'in';
  return null;
}

/**
 * The set of moves a list question asks for, worked out from the data (#18: "every move going into LKO-04 from
 * other stores" was answered with 2 of 5 plus a move going the other way). null = not a recognisable filter.
 */
export function expectedMoves(m: MovesFile, question: string, about: About): { ids: Set<string>; label: string } | null {
  if (about.moves.length) return null;   // a question about named moves is not a list question
  const q = question.toLowerCase();
  let set = m.moves;
  const label: string[] = [];
  const shops = about.stores.filter((id) => id !== 'WH-KOL');
  const otherStore = /\b(from|to) (other |another |the other )?stores?\b|store[- ]to[- ]store|between stores/.test(q);
  const otherWh = /\b(from|to) (the )?(warehouse|wh[- ]?kol)\b|back to (the )?warehouse/.test(q);
  const role = shops.length === 1 ? storeRole(q, m, shops[0]) : null;
  if (role) {
    const s = shops[0];
    set = set.filter((mv) => (role === 'in' ? mv.to === s : mv.from === s));
    label.push(role === 'in' ? `into ${s}` : `out of ${s}`);
    const end = (mv: Move) => (role === 'in' ? mv.from : mv.to);
    if (otherStore && !otherWh) (set = set.filter((mv) => end(mv) !== 'WH-KOL')), label.push(role === 'in' ? 'from stores' : 'to stores');
    if (otherWh && !otherStore) (set = set.filter((mv) => end(mv) === 'WH-KOL')), label.push(role === 'in' ? 'from the warehouse' : 'to the warehouse');
  } else if (shops.length === 0) {
    const t = typeClaim(q);
    if (t) (set = set.filter((mv) => mv.type === t)), label.push(TYPE_WORDS[t]);
  }
  if (/sign[- ]?off|approv/.test(q)) (set = set.filter((mv) => mv.needs_signoff)), label.push('needing sign-off');
  if (about.skus.length === 1) {
    const p = about.skus[0];
    (set = set.filter((mv) => mv.sku_id === p || mv.style_id === p)), label.push(`of ${p}`);
  }
  const prob = question.match(/\bP(\d{1,2})\b/);
  const problem = prob && m.problems.find((p) => p.id === `P${prob[1]}`);
  if (problem) (set = set.filter((mv) => problem.move_ids.includes(mv.id))), label.push(`in ${problem.id}`);
  return label.length ? { ids: new Set(set.map((mv) => mv.id)), label: `moves ${label.join(', ')}` } : null;
}

/** Compare the moves an answer lists with the moves the question asks for: no extras; none missing for a full list. */
function listCheck(m: MovesFile, question: string, about: About, answer: string): { total: number; missing: string[] } {
  const exp = expectedMoves(m, question, about);
  if (!exp) return { total: 0, missing: [] };
  const known = new Set(m.moves.map((mv) => mv.id));
  const listed = new Set((answer.match(MOVE_ID) ?? []).filter((id) => known.has(id)));
  const full = /\b(every|all|complete|list|which)\b/i.test(question) || /\b(every|all|complete|full list)\b/i.test(answer);
  if (!listed.size && !full) return { total: 0, missing: [] };
  const missing: string[] = [];
  const extra = [...listed].filter((id) => !exp.ids.has(id));
  if (extra.length) missing.push(`${extra.join(', ')} ${extra.length > 1 ? 'are' : 'is'} not among the ${exp.label}`);
  const shown = answer.match(/showing (\d+) of (\d+)/i);
  if (shown) {
    if (+shown[2] !== exp.ids.size || +shown[1] !== listed.size) {
      missing.push(`there are ${exp.ids.size} ${exp.label}; "showing ${shown[1]} of ${shown[2]}" should be "showing ${listed.size} of ${exp.ids.size}"`);
    }
  } else if (full) {
    const absent = [...exp.ids].filter((id) => !listed.has(id));
    const few = absent.slice(0, 20).join(', ') + (absent.length > 20 ? ` and ${absent.length - 20} more` : '');
    if (absent.length) missing.push(`there are ${exp.ids.size} ${exp.label}; missing: ${few}`);
  }
  return { total: 1, missing };
}
