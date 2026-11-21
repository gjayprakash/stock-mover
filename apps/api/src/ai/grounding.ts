// Grounding check: every number and date in an AI answer must come from the data we sent.
// Allowed = every number/date in the context (+ fixed rule numbers). A number also passes if it is a
// rounding of an allowed number, or the sum/difference of two allowed numbers (ASSUMPTION, issue #10).

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
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

export class AllowedSet {
  private readonly nums = new Set<number>();
  private readonly dates = new Set<string>();

  constructor(context: unknown, extraDates: string[] = []) {
    RULE_NUMBERS.forEach((n) => this.addNumber(n));
    extraDates.forEach((d) => this.addText(d));
    this.walk(context);
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
    for (const a of this.nums) if (this.nums.has(x - a) || this.nums.has(a - x)) return true;
    return false;
  }

  check(answer: string): GroundingResult {
    const { keys, rest } = datesIn(answer);
    const missing: string[] = [];
    let total = 0;
    for (const k of keys) {
      total++;
      if (!this.dates.has(k)) missing.push(`date ${k}`);
    }
    for (const n of numbersIn(rest)) {
      total++;
      if (!this.hasNumber(n)) missing.push(String(n));
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
