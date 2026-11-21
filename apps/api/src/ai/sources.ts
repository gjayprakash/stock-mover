// Ask v2: the wider data Ask may answer from, each added to the context only when the question needs it, and each
// with a checker that accepts a figure only on a line about the entity (and week, or run) it belongs to.
import { join } from 'path';
import type { HistoryFile, HistoryPoint, MovesFile, RunRow } from '@sm/contract';
import { readTable } from '../engine/data';
import {
  AGE_COVER, AGE_DAYS, AS_OF, DONOR_KEEP, MIN_DONOR_COVER, MIN_PULL_BACK, MIN_STORE_MOVE, NEW_STORE_DAYS, REORDER_COVER,
  REPLENISH_CYCLE_DAYS, SIGNOFF_INR, STOCKOUT_DAYS, TARGET_COVER, WINDOW_DAYS, WINDOW_START,
} from '../engine/params';
import type { About } from './entities';
import { CODE, MOVE_ID, NumberSet, datesIn, type LineSource } from './grounding';

// Same folder the engine reads (RunsService DATA_DIR): repo/data/csv from dist/ai.
const DATA_DIR = join(__dirname, '..', '..', '..', '..', 'data', 'csv');
const sum = (a: number[]) => a.reduce((t, x) => t + x, 0);
const md = (iso: string) => { const [, m, d] = iso.slice(0, 10).split('-'); return `${+m}-${+d}`; };

// ---------- Rules and settings ----------

type RulesData = {
  note: string;
  rules: { rule: string; detail: string }[];
  lead_times_days: { route: string; days: number }[];
  min_display_units: Record<string, Record<string, number>>;
  settings: { setting: string; value: number; unit: string }[];
};
let rulesCache: RulesData | null = null;

/** rules.csv, lead_times.csv, min_display.csv and the engine's settings (params.ts), in plain words. */
export function rulesData(): RulesData {
  if (rulesCache) return rulesCache;
  const rules = readTable(DATA_DIR, 'rules', ['rule', 'detail']).map((r) => ({ rule: r.rule, detail: r.detail }));
  const lead = readTable(DATA_DIR, 'lead_times', ['route', 'days']).map((r) => ({ route: r.route, days: Number(r.days) }));
  const min: Record<string, Record<string, number>> = {};
  for (const r of readTable(DATA_DIR, 'min_display', ['tier', 'category', 'min_display_units'])) {
    (min[r.tier] ??= {})[r.category] = Number(r.min_display_units);
  }
  const s = (setting: string, value: number, unit: string) => ({ setting, value, unit });
  rulesCache = {
    note: "Company rules (rules sheet), lead times, minimum display per store tier and category, and Stock Mover's own settings. The same every day.",
    rules,
    lead_times_days: lead,
    min_display_units: min,
    settings: [
      s('A store is filled up to this much cover', TARGET_COVER, 'days'),
      s('A store and product is restocked only when its cover drops under', REORDER_COVER, 'days'),
      s('A giving store must keep at least this much cover after a store to store move (rule)', MIN_DONOR_COVER, 'days'),
      s('A store only gives away stock above this much cover', DONOR_KEEP, 'days'),
      s('Stock counts as ageing after this many days in the store', AGE_DAYS, 'days'),
      s('…and only when its cover is above', AGE_COVER, 'days'),
      s('A single move above this value at MRP needs sign-off', SIGNOFF_INR, '₹'),
      s('A store counts as new for its first', NEW_STORE_DAYS, 'days'),
      s(`Sales window used for selling speed (${WINDOW_START} to ${AS_OF})`, WINDOW_DAYS, 'days'),
      s('A product counts as sold out when it was out of stock for more than this many of the last 84 days', STOCKOUT_DAYS, 'days'),
      s('Smallest store to store or ageing move', MIN_STORE_MOVE, 'pieces'),
      s('Smallest move back to the warehouse (unless the store is too full)', MIN_PULL_BACK, 'pieces'),
      s('The warehouse tops stores up every', REPLENISH_CYCLE_DAYS, 'days'),
    ],
  };
  return rulesCache;
}

const RULE_LINE = /\b(rules?|minimum display|min(imum)?[- ]display|display at least|lead[- ]?times?|flagships?|s\+\+|top[- ]?20|capacity|donor|giving store|target cover|filled up to|threshold|settings?|sign[- ]?off|ageing|aging|new stores?|sales window|smallest|tops? (stores )?up|every monday|tiers?|takes? \d+ days?|same city|same zone|different zones?)\b|S\+\+/i;
const TIERS = ['S++', 'S+', 'A', 'B'];
const tierIn = (line: string) =>
  TIERS.filter((t) => new RegExp(`(^|[\\s(])${t.replace(/\+/g, '\\+')}(?![+\\w])`, 'i').test(line) && (t.length > 1 || /\b(tier|stores?)\b/i.test(line)));

// Words that name one lead-time route; a line naming routes may only use those routes' days.
const ROUTES: [RegExp, RegExp][] = [
  [/\bsame city\b/i, /same city/i],
  [/\bsame zone\b/i, /same zone/i],
  [/\b(different|other|another) zones?\b/i, /different zone/i],
  [/\b(east|bihar|patna|muzaffarpur)\b/i, /east zone/i],
  [/\b(north|uttar pradesh|lucknow|kanpur|\bup\b)\b/i, /north zone/i],
  [/\b(south|karnataka|bengaluru|bangalore|mysuru|mysore)\b/i, /south zone/i],
];

/** Rule numbers on a line that talks about a rule and names no move; minimum display only for the tiers / categories it names, lead times only for the routes it names. */
export function rulesSource(r: RulesData): LineSource {
  const cache = new Map<string, NumberSet>();
  const only = new Map<string, boolean>();
  return {
    lineSet(line) {
      if (!RULE_LINE.test(line) || (line.match(MOVE_ID) ?? []).length) return null;
      const tiers = tierIn(line);
      const cats = Object.keys(r.min_display_units[TIERS[0]] ?? {}).filter((c) => line.toLowerCase().includes(c.toLowerCase().split(' (')[0]));
      const routes = ROUTES.filter(([said]) => said.test(line)).map(([, row]) => row);
      const k = `${tiers.join(',')}|${cats.join(',')}|${routes.map(String).join(',')}|${/lead|travel/i.test(line)}|${/display/i.test(line)}`;
      if (!cache.has(k)) {
        const lead = r.lead_times_days.filter((x) => !routes.length || routes.some((re) => re.test(x.route)));
        const min = Object.entries(r.min_display_units)
          .filter(([t]) => !tiers.length || tiers.includes(t))
          .flatMap(([, row]) => Object.entries(row).filter(([c]) => !cats.length || cats.includes(c)).map(([, n]) => n));
        // A lead-time line gets lead times only, a minimum-display line its rows only; other rule lines get the settings.
        const leadLine = routes.length > 0 || /\blead[- ]?times?\b|\btravel/i.test(line);
        const minLine = tiers.length > 0 || /\b(min(imum)?[- ]display|display at least)\b/i.test(line);
        only.set(k, leadLine || minLine);
        cache.set(k, new NumberSet(false, r.rules,
          leadLine || !minLine ? lead.map((x) => x.days) : [],
          minLine || !leadLine ? min : [],
          !leadLine && !minLine ? r.settings : []));
      }
      return { set: cache.get(k)!, only: only.get(k)! };
    },
  };
}

// ---------- 12-week history ----------

type Entry = { store?: string; sku?: string; weekly: Map<string, number[]>; summary: number[] };
const MAX_PAIRS = 16;
const TOP = 10;

/** Totals the model may quote for a series, all worked out here (it never adds up weeks itself). */
function totals(pts: { units_sold: number; closing_on_hand: number; days_in_stock?: number }[]) {
  const units = pts.map((p) => p.units_sold);
  const first4 = sum(units.slice(0, 4));
  const last4 = sum(units.slice(-4));
  return {
    weeks: pts.length,
    units_sold: sum(units),
    avg_units_per_week: Math.round((sum(units) / Math.max(1, pts.length)) * 10) / 10,
    ...(pts[0]?.days_in_stock !== undefined ? { days_in_stock: sum(pts.map((p) => p.days_in_stock ?? 0)), days_in_window: pts.length * 7 } : {}),
    first_4_weeks_units: first4,
    last_4_weeks_units: last4,
    trend: last4 > first4 ? 'up' : last4 < first4 ? 'down' : 'flat',
    best_week: pts.reduce((b, p, i) => (p.units_sold > pts[b].units_sold ? i : b), 0),
    on_hand_at_start: pts[0]?.closing_on_hand ?? 0,
    on_hand_at_end: pts[pts.length - 1]?.closing_on_hand ?? 0,
  };
}

/**
 * History for the question: one series per store × product pair for named moves / products (capped), a weekly total
 * per named store, or, when nothing is named, network totals per week, per store and the top products.
 * `h` is already scoped (RunsService.latest → scopeHistory): only pairs of the moves this user can see.
 */
export function historyData(h: HistoryFile, m: MovesFile, about: About) {
  const all = Object.entries(h).map(([key, points]) => { const [store, sku] = key.split('|'); return { key, store, sku, points }; });
  const weeks = all[0]?.points.map((p) => p.week_ending) ?? [];
  const names = new Map(m.moves.flatMap((mv) => [[mv.sku_id, `${mv.style_name} (${mv.sku_id.slice(mv.style_id.length + 1)})`], [mv.style_id, mv.style_name]] as [string, string][]));
  const shops = about.stores.filter((s) => s !== 'WH-KOL');
  const ofProd = (sku: string, p: string) => sku === p || sku.startsWith(p + '-');
  const pairs = new Map<string, (typeof all)[number]>();
  for (const id of about.moves) {
    const mv = m.moves.find((x) => x.id === id);
    if (mv) all.filter((s) => s.sku === mv.sku_id && (s.store === mv.from || s.store === mv.to)).forEach((s) => pairs.set(s.key, s));
  }
  for (const s of all) {
    if (about.skus.some((p) => ofProd(s.sku, p)) && (!shops.length || shops.includes(s.store))) pairs.set(s.key, s);
  }
  const chosen = [...pairs.values()].slice(0, MAX_PAIRS);
  const entries: Entry[] = [];
  const row = (p: { week_ending: string; units_sold: number; closing_on_hand: number; days_in_stock?: number }) =>
    p.days_in_stock !== undefined ? [p.week_ending, p.units_sold, p.closing_on_hand, p.days_in_stock] : [p.week_ending, p.units_sold, p.closing_on_hand];
  const entry = (store: string | undefined, sku: string | undefined, pts: { week_ending: string; units_sold: number; closing_on_hand: number; days_in_stock?: number }[], t: object) => {
    entries.push({ store, sku, weekly: new Map(pts.map((p) => [md(p.week_ending), row(p).slice(1) as number[]])), summary: Object.entries(t).filter(([k, v]) => k !== 'best_week' && typeof v === 'number').map(([, v]) => v as number) });
  };
  const addUp = (list: HistoryPoint[][]) => weeks.map((w, i) => ({ week_ending: w, units_sold: sum(list.map((p) => p[i]?.units_sold ?? 0)), closing_on_hand: sum(list.map((p) => p[i]?.closing_on_hand ?? 0)) }));
  const withWeek = <T extends { best_week: number }>(t: T, pts: { week_ending: string }[]) => ({ ...t, best_week: pts[t.best_week]?.week_ending });

  const series = chosen.map((s) => {
    const t = totals(s.points);
    entry(s.store, s.sku, s.points, t);
    return { store: s.store, product: s.sku, product_name: names.get(s.sku), weeks: s.points.map(row), totals: withWeek(t, s.points) };
  });
  // A product named across several stores also gets its total over those stores.
  const products = about.skus.map((p) => {
    const its = all.filter((s) => ofProd(s.sku, p) && (!shops.length || shops.includes(s.store)));
    if (its.length < 2) return null;
    const pts = addUp(its.map((s) => s.points));
    const t = totals(pts);
    entry(shops.length === 1 ? shops[0] : undefined, p, pts, t);
    return { product: p, product_name: names.get(p), pairs: its.length, stores: [...new Set(its.map((s) => s.store))], weeks: pts.map(row), totals: withWeek(t, pts) };
  }).filter(Boolean);
  // A store named without a product: its weekly total over its pairs, and each product's 12-week total.
  const stores = (about.skus.length ? [] : shops).map((id) => {
    const its = all.filter((s) => s.store === id);
    if (!its.length) return null;
    const pts = addUp(its.map((s) => s.points));
    const t = totals(pts);
    entry(id, undefined, pts, t);
    const byProduct = its.map((s) => ({ product: s.sku, product_name: names.get(s.sku), ...totals(s.points) }))
      .sort((a, b) => b.units_sold - a.units_sold);
    byProduct.forEach((b) => entries.push({ store: id, sku: b.product, weekly: new Map(), summary: Object.entries(b).filter(([k, v]) => k !== 'best_week' && typeof v === 'number').map(([, v]) => v as number) }));
    return { store: id, pairs: its.length, weeks: pts.map(row), totals: withWeek(t, pts), by_product: byProduct.map(({ best_week: _b, ...b }) => b) };
  }).filter(Boolean);

  let network: object | null = null;
  if (!chosen.length && !stores.length && !products.length && all.length) {
    const pts = addUp(all.map((s) => s.points));
    const t = totals(pts);
    entry(undefined, undefined, pts, t);
    const byStore = [...new Set(all.map((s) => s.store))].map((id) => {
      const its = all.filter((s) => s.store === id);
      const tt = totals(addUp(its.map((s) => s.points)));
      entries.push({ store: id, weekly: new Map(), summary: [tt.units_sold, tt.avg_units_per_week, tt.first_4_weeks_units, tt.last_4_weeks_units, its.length] });
      return { store: id, pairs: its.length, units_sold: tt.units_sold, first_4_weeks_units: tt.first_4_weeks_units, last_4_weeks_units: tt.last_4_weeks_units, trend: tt.trend };
    }).sort((a, b) => b.units_sold - a.units_sold);
    const bySku = new Map<string, number>();
    all.forEach((s) => bySku.set(s.sku, (bySku.get(s.sku) ?? 0) + sum(s.points.map((p) => p.units_sold))));
    const top = [...bySku.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP).map(([sku, units]) => ({ product: sku, product_name: names.get(sku), units_sold: units }));
    top.forEach((x) => entries.push({ sku: x.product, weekly: new Map(), summary: [x.units_sold] }));
    const none = [...bySku.values()].filter((u) => u === 0).length;
    network = { pairs: all.length, weeks: pts.map(row), totals: withWeek(t, pts), by_store: byStore, top_products: top, products_with_no_sales: none };
    entries[0].summary.push(none, bySku.size);
  }

  const ctx = {
    note:
      `Sales and stock for the ${weeks.length} weeks ${weeks[0] ?? ''} to ${weeks[weeks.length - 1] ?? ''}, from the daily run. ` +
      `It is kept only for the ${all.length} store and product pairs on today's list (not every product). ` +
      'weeks rows = [week_ending, units_sold, closing_on_hand, days_in_stock] (totals over several pairs have no days_in_stock). ' +
      'totals are already added up: copy them, never add weeks yourself. Name the week (its week_ending date) when you quote one week.',
    ...(series.length ? { pairs: series, ...(pairs.size > chosen.length ? { pairs_note: `showing ${chosen.length} of ${pairs.size} pairs` } : {}) } : {}),
    ...(products.length ? { products } : {}),
    ...(stores.length ? { stores } : {}),
    ...(network ? { network } : {}),
  };
  const count = series.length + products.length + stores.length + (network ? 1 : 0);
  const detail = network
    ? `12-week totals for all ${all.length} store and product pairs on the list`
    : `12 weeks of sales and stock for ${[series.length && `${series.length} store-product pair${series.length > 1 ? 's' : ''}`, stores.length && `${stores.length} store${stores.length > 1 ? 's' : ''}`, products.length && `${products.length} product total${products.length > 1 ? 's' : ''}`].filter(Boolean).join(', ') || 'nothing (no history for what you named)'}`;
  return { ctx, source: historySource(entries), detail, empty: count === 0 };
}

// "12 weeks", "first 4 weeks", "84 days": the window's own words.
const WINDOW_WORDS = [12, 4, 84];
const HISTORY_LINE = /\b(weeks?|weekly|sold|sales|sell\w*|trend\w*|in stock|days in stock|closing|on hand|average|avg|per week|last 12|twelve)\b/i;

/** A history figure passes only on a line about its own entity (store, product, pair) and, when a week is named, that week. */
function historySource(entries: Entry[]): LineSource {
  const stores = new Set(entries.map((e) => e.store).filter(Boolean));
  const skus = new Set(entries.map((e) => e.sku).filter(Boolean));
  const allWeeks = new Set(entries.flatMap((e) => [...e.weekly.keys()]));
  return {
    lineSet(line) {
      const weeks = datesIn(line).keys.filter((k) => allWeeks.has(k));
      if (!weeks.length && !HISTORY_LINE.test(line)) return null;
      const codes = line.match(CODE) ?? [];
      const st = codes.filter((c) => stores.has(c));
      const sk = codes.filter((c) => skus.has(c) || [...skus].some((s) => s!.startsWith(c + '-')));
      const prodOk = (e: Entry) => !!e.sku && sk.some((c) => e.sku === c || e.sku!.startsWith(c + '-'));
      const pick = st.length && sk.length ? entries.filter((e) => !!e.store && st.includes(e.store) && prodOk(e))
        : st.length ? entries.filter((e) => !!e.store && st.includes(e.store))
        : sk.length ? entries.filter(prodOk)
        : entries; // no entity named on the line: only what was sent for this question
      if (!pick.length) return { set: new NumberSet(false), only: true };
      const values: unknown[] = [];
      for (const e of pick) {
        const ws = weeks.length ? weeks : [...e.weekly.keys()];
        values.push(e.summary); // the entity's totals; one week's figures only for the week(s) the line names
        for (const w of ws) if (e.weekly.has(w)) values.push(e.weekly.get(w));
      }
      const set = NumberSet.plain(values, WINDOW_WORDS);
      [...allWeeks].forEach((w) => set.dates.add(w));
      return { set, only: true };
    },
  };
}

// ---------- Past runs ----------

const TRIGGER: Record<RunRow['trigger'], string> = { cron: 'scheduled daily run', boot: 'on server start', manual: 'started by hand' };
const ist = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const MAX_RUNS = 10;

/**
 * Past runs, newest first. One location's view (#77) gets dates and status only: move counts are for all stores.
 */
export function runsData(rows: RunRow[], loc: string | null, nextRunAt: string) {
  const list = rows.slice(0, MAX_RUNS).map((r) => ({
    started: ist(r.started_at), as_of: r.as_of, status: r.status.toLowerCase(), how: TRIGGER[r.trigger],
    ...(loc ? {} : { moves: r.moves, rule_breaks: r.violations }),
    ...(r.error ? { error: r.error.slice(0, 120) } : {}),
  }));
  const ctx = {
    note: `The last ${list.length} of ${rows.length} daily runs, newest first. Times are India time.` +
      (loc ? ` Move counts are for all stores, so they are left out: you can only see ${loc}.` : ''),
    next_run: ist(nextRunAt),
    runs: list,
  };
  return { ctx, source: runsSource(list), detail: `${list.length} past run${list.length === 1 ? '' : 's'}${list[0] ? `, latest ${list[0].started}` : ''}` };
}

const RUN_LINE = /\b(runs?|ran|list (was|had)|earlier list|previous list|next run|daily run)\b/i;

function runsSource(list: { started: string; as_of: string }[]): LineSource {
  const sets = list.map((r) => ({ keys: new Set(datesIn(r.started).keys), set: NumberSet.plain(r) }));
  const any = NumberSet.plain(list, list.length);
  return {
    lineSet(line) {
      if (!RUN_LINE.test(line) || /\brun(s|ning)? (out|empty|low)\b/i.test(line)) return null;
      const keys = datesIn(line).keys;
      const hit = sets.filter((s) => keys.some((k) => s.keys.has(k)));
      if (!hit.length) return { set: any, only: true };
      const set = NumberSet.plain();
      for (const h of hit) { h.set.nums.forEach((n) => set.nums.add(n)); h.set.dates.forEach((d) => set.dates.add(d)); }
      return { set, only: true };
    },
  };
}
