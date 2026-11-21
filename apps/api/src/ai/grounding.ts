// Grounding check: every number and date in an AI answer must come from the data we sent.
// Allowed = every number/date in the context (+ fixed rule numbers). A number also passes if it is a
// rounding of an allowed number, or the sum/difference of two allowed numbers (ASSUMPTION, issue #10).

import type { Move, MoveType, MovesFile, StoreSummary } from '@sm/contract';

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

const md = (m: number, d: number) => `${m}-${d}`;

function datesIn(text: string): { keys: string[]; rest: string } {
  const keys: string[] = [];
  let rest = text.replace(ISO_DATE, (_, _y, m, d) => (keys.push(md(+m, +d)), ' '));
  rest = rest.replace(DAY_MON, (_, d, mon) => (keys.push(md(MONTHS.indexOf(mon.slice(0, 3).toLowerCase()) + 1, +d)), ' '));
  rest = rest.replace(MON_DAY, (_, mon, d) => (keys.push(md(MONTHS.indexOf(mon.slice(0, 3).toLowerCase()) + 1, +d)), ' '));
  return { keys, rest };
}

function numbersIn(text: string): number[] {
  return (text.replace(CODES, ' ').match(NUMBER) ?? []).map((n) => Number(n.replace(/,/g, '')));
}

/** Numbers and dates that may be quoted. `derived` also accepts the sum/difference of two members. */
class NumberSet {
  readonly nums = new Set<number>();
  readonly dates = new Set<string>();

  constructor(private readonly derived: boolean, ...values: unknown[]) {
    RULE_NUMBERS.forEach((n) => this.addNumber(n));
    values.forEach((v) => this.walk(v));
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

// What a line says about a move's direction, checked against the move's `type`.
const TYPE_CLAIMS: [MoveType, RegExp][] = [
  ['PULL_BACK', /\b(back to (the )?(warehouse|WH-KOL)|pull[- ]?backs?|return(s|ed|ing)? (\w+ )?to (the )?(warehouse|WH-KOL)|to the warehouse)\b/i],
  ['WH_TO_STORE', /\bfrom (the )?(warehouse|WH-KOL)\b/i],
  ['STORE_TO_STORE', /\b(store[- ]to[- ]store|between (two )?stores|from one store to another)\b/i],
];
const typeClaim = (s: string): MoveType | null => {
  const hits = TYPE_CLAIMS.filter(([, re]) => re.test(s)).map(([t]) => t);
  return hits.length === 1 ? hits[0] : null;
};
const MOVE_ID = /\bM\d{4}\b/g;
const CODE = /\b(?:[A-Z]{2,4}-\d{2}(?:-[A-Z0-9]+)?|WH-KOL)\b/g;
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

  constructor(context: unknown, private readonly extraDates: string[] = [], private readonly file?: MovesFile) {
    this.global = new NumberSet(true, context, extraDates);
    file?.moves.forEach((mv) => this.moves.set(mv.id, mv));
    file?.stores.forEach((s) => this.stores.set(s.store_id, s));
    const tally = (mvs: Move[]) => [mvs.length, mvs.reduce((t, x) => t + x.qty, 0), mvs.reduce((t, x) => t + x.value_inr, 0)];
    this.runTotals = file
      ? [file.summary, file.blocked, file.run.as_of, extraDates,
          [...new Set(file.moves.map((x) => x.type))].map((t) => tally(file.moves.filter((x) => x.type === t))),
          [...new Set(file.moves.map((x) => x.trigger))].map((t) => tally(file.moves.filter((x) => x.trigger === t))),
          tally(file.moves.filter((x) => x.needs_signoff))]
      : [];
  }

  private moveSet(mv: Move) {
    const k = `m:${mv.id}`;
    if (!this.cache.has(k)) this.cache.set(k, new NumberSet(false, mv, this.runTotals));
    return this.cache.get(k)!;
  }

  private storeSet(id: string) {
    const k = `s:${id}`;
    if (!this.cache.has(k)) {
      const mvs = this.file!.moves.filter((x) => x.from === id || x.to === id);
      const inc = mvs.filter((x) => x.to === id);
      const out = mvs.filter((x) => x.from === id);
      const flow = [inc.length, inc.reduce((t, x) => t + x.qty, 0), out.length, out.reduce((t, x) => t + x.qty, 0)];
      this.cache.set(k, new NumberSet(false, this.stores.get(id) ?? null, flow, mvs.map((x) => x.arrives_on), this.runTotals));
    }
    return this.cache.get(k)!;
  }

  check(answer: string): GroundingResult {
    const missing: string[] = [];
    let total = 0;
    let listClaim: MoveType | null = null;   // set by a heading line ("these go back to the warehouse:")
    for (const seg of this.file ? segments(answer) : [answer]) {
      const ids = [...new Set(seg.match(MOVE_ID) ?? [])].filter((id) => this.moves.has(id));
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
        const said = claim ?? listClaim;
        if (said) {
          total++;
          if (said !== mv.type) missing.push(`${mv.id} is ${mv.type}, not ${said}`);
        }
      } else {
        if (ids.length === 0) listClaim = claim;
        if (this.file && ids.length === 0 && !namesProblem && storeCodes.length === 1 && codes.length === 1 && storeCodes[0] !== 'WH-KOL') {
          set = this.storeSet(storeCodes[0]);
          about = ` for ${storeCodes[0]}`;
        }
      }
      const { keys, rest } = datesIn(seg);
      for (const k of keys) {
        total++;
        if (!set.dates.has(k)) missing.push(`date ${k}${about}`);
      }
      for (const n of numbersIn(rest)) {
        total++;
        if (!set.hasNumber(n)) missing.push(`${n}${about}`);
      }
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
