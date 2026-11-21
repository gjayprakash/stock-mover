// Validator (docs/02-engine.md §4). Trusts nothing in the move list: recomputes every rule from the
// raw positions and the moves' own from/to/qty. Failing moves are dropped and logged with the rule.
import type { Move } from '@sm/contract';
import { displayCategory, key, leadTime, storeDistance } from './clean';
import type { Positions } from './position';
import { MIN_DONOR_COVER, TODAY, WAREHOUSE_ID } from './params';
import { addDays } from './dates';

export type Rule =
  | 'min_display' | 'capacity' | 'flagship' | 'in_transit' | 'donor_cover_30' | 'source_qty' | 'lead_time' | 'arrival_reason' | 'data_flag';
export type Violation = { move_id: string; rule: Rule; detail: string };
export type ValidateResult = { moves: Move[]; dropped: Violation[]; violations: Violation[] };

/** Every rule violation in this move list, judged on the end state after all moves. */
export function findViolations(P: Positions, moves: Move[]): Violation[] {
  const { c } = P;
  const out: Violation[] = [];
  const v = (m: Move, rule: Rule, detail: string) => out.push({ move_id: m.id, rule, detail });
  const sum = new Map<string, number>();
  const add = (k: string, q: number) => sum.set(k, (sum.get(k) ?? 0) + q);
  const get = (k: string) => sum.get(k) ?? 0;

  for (const m of moves) {
    const cat = displayCategory(c.items.get(m.sku_id)?.category ?? '');
    add(`out|${m.from}|${m.sku_id}`, m.qty);
    add(`in|${m.to}|${m.sku_id}`, m.qty);
    if (m.trigger === 'MIN_DISPLAY') add(`inmd|${m.to}|${m.sku_id}`, m.qty);
    add(`sout|${m.from}`, m.qty);
    add(`sin|${m.to}`, m.qty);
    add(`cout|${m.from}|${cat}`, m.qty);
  }
  const lowestPriority = (ms: Move[]) => ms.reduce((a, b) => (b.priority < a.priority || (b.priority === a.priority && b.id > a.id) ? b : a));

  for (const m of moves) {
    const fromStore = m.from !== WAREHOUSE_ID;
    const toStore = m.to !== WAREHOUSE_ID;
    if (!(m.qty > 0) || !Number.isInteger(m.qty)) v(m, 'source_qty', `qty ${m.qty} is not a whole positive number`);
    if (fromStore && !c.storeById.has(m.from)) v(m, 'source_qty', `unknown source ${m.from}`);
    if (toStore && !c.storeById.has(m.to)) v(m, 'capacity', `unknown destination ${m.to}`);
    if (!c.items.has(m.sku_id)) { v(m, 'source_qty', `unknown or packaging SKU ${m.sku_id}`); continue; }
    if (!fromStore && !toStore) v(m, 'source_qty', 'warehouse to warehouse');
    if ((fromStore && P.rows.get(key(m.from, m.sku_id))?.flagged) || (toStore && P.rows.get(key(m.to, m.sku_id))?.flagged))
      v(m, 'data_flag', 'store×SKU has a wrong count (A8)');

    // 3 · S++ never gives away a protected style
    const style = c.items.get(m.sku_id)!.style_id;
    if (fromStore && c.storeById.get(m.from)?.tier === 'S++' && c.protectedStyles.has(key(m.from, style)))
      v(m, 'flagship', `${style} is protected at ${m.from}`);

    // 4 · in-transit counted: nothing sent to a store that already has enough on the way
    if (toStore && m.trigger !== 'MIN_DISPLAY') {
      const p = P.rows.get(key(m.to, m.sku_id));
      if (!p) v(m, 'in_transit', 'receiver has no demand history for this SKU');
      else {
        const end = p.available + get(`in|${m.to}|${m.sku_id}`) - get(`inmd|${m.to}|${m.sku_id}`) - get(`out|${m.to}|${m.sku_id}`);
        if (p.available >= p.target_units) v(m, 'in_transit', `${p.available} on hand + in transit already ≥ target ${p.target_units}`);
        else if (end > p.target_units) v(m, 'in_transit', `sends ${end} vs target ${p.target_units}`);
      }
    }
    if (toStore && m.trigger === 'MIN_DISPLAY') {
      const s = P.byStore.get(m.to)!;
      const cat = displayCategory(c.items.get(m.sku_id)?.category ?? '');
      if ((s.cat_units[cat] ?? 0) >= (s.min_display[cat] ?? 0)) v(m, 'in_transit', `${cat} already at minimum display`);
    }

    // 5 · donor keeps ≥ 30 days cover after store → store
    if (m.type === 'STORE_TO_STORE') {
      const d = P.rows.get(key(m.from, m.sku_id));
      if (d && d.velocity > 0) {
        const end = d.available - get(`out|${m.from}|${m.sku_id}`) + get(`in|${m.from}|${m.sku_id}`);
        if (end / d.velocity < MIN_DONOR_COVER) v(m, 'donor_cover_30', `${m.from} left at ${(end / d.velocity).toFixed(1)} days`);
      }
    }

    // 7 · rule 5: lead time = lead_times tab for the route (never faster), arrival = today + lead time, reason present
    if (fromStore || toStore) {
      const lead = toStore ? leadTime(m.from, m.to, c.storeById, c.leadTimes) : leadTime(WAREHOUSE_ID, m.from, c.storeById, c.leadTimes);
      if (m.lead_time_days < lead) v(m, 'lead_time', `lead ${m.lead_time_days} days is below the lead_times tab (${lead}) for ${m.from} → ${m.to}`);
      else if (m.lead_time_days !== lead || m.arrives_on !== addDays(TODAY, lead)) v(m, 'arrival_reason', `lead ${m.lead_time_days}/${m.arrives_on}, expected ${lead}/${addDays(TODAY, lead)}`);
      if (m.type === 'STORE_TO_STORE') {
        if (m.travel_days !== m.lead_time_days) v(m, 'arrival_reason', `travel ${m.travel_days} d ≠ lead ${m.lead_time_days} d`);
        const dist = storeDistance(m.from, m.to, c.locations);
        if (dist && m.distance_km !== dist.km) v(m, 'arrival_reason', `distance ${m.distance_km} km, expected ${dist.km}`);
      }
    }
    if (!m.reason || !m.reason.trim()) v(m, 'arrival_reason', 'no reason line');
  }

  // 6 · qty ≤ what the source actually has, summed across moves (lowest-priority move takes the blame)
  const bySource = groupBy(moves, (m) => `${m.from}|${m.sku_id}`);
  for (const [k, ms] of bySource) {
    const [from, sku] = k.split('|');
    const has = from === WAREHOUSE_ID ? P.wh.get(sku)?.on_hand ?? 0 : P.rows.get(k)?.on_hand ?? 0;
    const total = ms.reduce((a, m) => a + m.qty, 0);
    if (total > has) v(lowestPriority(ms), 'source_qty', `${from} sends ${total} of ${sku} but has ${has}`);
  }
  // 1 · min display kept per store × category (pieces leaving may not take it under minimum)
  const byStoreCatOut = groupBy(moves.filter((m) => m.from !== WAREHOUSE_ID), (m) => `${m.from}|${displayCategory(c.items.get(m.sku_id)?.category ?? '')}`);
  for (const [k, ms] of byStoreCatOut) {
    const [store, cat] = k.split('|');
    const s = P.byStore.get(store);
    if (!s) continue;
    const left = (s.cat_units[cat] ?? 0) - get(`cout|${store}|${cat}`);
    if (left < (s.min_display[cat] ?? 0)) v(lowestPriority(ms), 'min_display', `${store} ${cat} left at ${left} < ${s.min_display[cat]}`);
  }
  // 2 · capacity: units + in transit + in − out ≤ capacity at every receiving store
  const byStoreIn = groupBy(moves.filter((m) => m.to !== WAREHOUSE_ID), (m) => m.to);
  for (const [store, ms] of byStoreIn) {
    const s = P.byStore.get(store);
    if (!s) continue;
    const end = s.store_units + s.store_in_transit + get(`sin|${store}`) - get(`sout|${store}`);
    if (end > s.capacity) v(lowestPriority(ms), 'capacity', `${store} ends at ${end} of ${s.capacity}`);
  }
  return out;
}

/** Drop failing moves until the list is clean. Survivors get every check set true. */
export function validate(P: Positions, moves: Move[]): ValidateResult {
  let list = moves.slice();
  const dropped: Violation[] = [];
  for (let i = 0; i < 50; i++) {
    const vs = findViolations(P, list);
    if (!vs.length) break;
    const bad = new Set(vs.map((x) => x.move_id));
    dropped.push(...vs);
    list = list.filter((m) => !bad.has(m.id));
  }
  const violations = findViolations(P, list);
  for (const m of list) m.checks = { min_display: true, capacity: true, flagship: true, in_transit: true, donor_cover_30: true };
  return { moves: list, dropped, violations };
}

function groupBy<T>(xs: T[], f: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = f(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(x);
  }
  return m;
}
