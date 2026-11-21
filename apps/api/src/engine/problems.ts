// Problem detection (#7): up to 6 named problems, each with template text built from real numbers.
import type { Move, Problem, ProblemKind, StoreSummary } from '@sm/contract';
import type { Position, Positions } from './position';
import {
  AGE_DAYS, AS_OF, LAUNCH_DAYS, NEW_STORE_DAYS, PROBLEMS_SHOWN, SLOW_BOTTOM_SHARE, SLOW_SHELF_DAYS_PER_STORE,
  STARVED_INBOUND_DAYS, STARVED_SHELF_DROP, STARVED_TOP_SHARE, TODAY, UNDER_STOCKED_FILL, UNDER_STOCKED_SOLD_OUT,
} from './params';
import { addDays, dayDate, daysBetween, shortDate } from './dates';
import { rate } from './reasons';

type Candidate = Omit<Problem, 'id' | 'rank' | 'needs_signoff_count'>;
export type ProblemsResult = { problems: Problem[]; starved_bestseller: number };

const sumArr = (a: number[]) => a.reduce((x, y) => x + y, 0);
const fmtInr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

export function buildProblems(P: Positions, moves: Move[], stores: StoreSummary[]): ProblemsResult {
  const { c } = P;
  const rows = [...P.rows.values()];
  const nW = c.weeks.length;
  const where = (store: string) => `${c.storeById.get(store)!.city} ${store}`;
  const priority = (ms: Move[]) => ms.reduce((a, m) => a + m.priority, 0);
  const pieces = (ms: Move[]) => ms.reduce((a, m) => a + m.qty, 0);
  const lastArrival = (ms: Move[]) => ms.reduce((a, m) => (m.arrives_on > a ? m.arrives_on : a), TODAY);
  const fixLine = (ms: Move[]) => {
    const fromWh = ms.filter((m) => m.from === 'WH-KOL');
    const toStores = new Set(ms.filter((m) => m.to !== 'WH-KOL').map((m) => m.to));
    const parts: string[] = [];
    if (fromWh.length) parts.push(`${pieces(fromWh)} pieces from the warehouse`);
    const s2s = ms.filter((m) => m.type === 'STORE_TO_STORE');
    if (s2s.length) parts.push(`${pieces(s2s)} from other stores`);
    const back = ms.filter((m) => m.type === 'PULL_BACK');
    const dest = toStores.size === 1 ? [...toStores][0] : `${toStores.size} stores`;
    let line = parts.length ? `Send ${parts.join(' and ')} to ${dest}` : '';
    if (back.length) line += `${line ? '; ' : ''}pull back ${pieces(back)} pieces to the warehouse`;
    return `${line}; all arrive by ${dayDate(lastArrival(ms))}.`;
  };

  // Style-level aggregates over all stores and sizes.
  type StyleAgg = { style_id: string; name: string; rows: Position[]; units: number[]; days: number[]; velocity: number; units12: number; instock: number };
  const styles = new Map<string, StyleAgg>();
  for (const p of rows) {
    const it = c.items.get(p.sku_id)!;
    let s = styles.get(p.style_id);
    if (!s) styles.set(p.style_id, (s = { style_id: p.style_id, name: it.style_name, rows: [], units: new Array(nW).fill(0), days: new Array(nW).fill(0), velocity: 0, units12: 0, instock: 0 }));
    s.rows.push(p);
    p.v.weekly_units.forEach((u, i) => (s!.units[i] += u));
    p.v.weekly_days.forEach((d, i) => (s!.days[i] += d));
    s.velocity += p.velocity; s.units12 += p.units_12w; s.instock += p.instock_days;
  }
  const chartFor = (s: StyleAgg) => ({
    label: `${s.name}, all stores and sizes, last 12 weeks`,
    weeks: c.weeks.slice(),
    series: [{ name: 'Pieces sold', values: s.units.slice() }, { name: 'Days on the shelf', values: s.days.slice() }],
  });

  const cands: Candidate[] = [];
  const push = (kind: ProblemKind, x: Omit<Candidate, 'kind'>) => cands.push({ kind, ...x });

  // P1 STARVED_BESTSELLER
  const byVel = [...styles.values()].sort((a, b) => b.velocity - a.velocity);
  const top = new Set(byVel.slice(0, Math.max(1, Math.ceil(byVel.length * STARVED_TOP_SHARE))).map((s) => s.style_id));
  let starvedCount = 0;
  for (const s of styles.values()) {
    if (!top.has(s.style_id)) continue;
    const last3 = sumArr(s.days.slice(nW - 3)) / 3, prior9 = sumArr(s.days.slice(0, nW - 3)) / (nW - 3);
    const u3 = sumArr(s.units.slice(nW - 3)) / 3, u9 = sumArr(s.units.slice(0, nW - 3)) / (nW - 3);
    if (!(prior9 > 0 && last3 <= (1 - STARVED_SHELF_DROP) * prior9 && u3 < u9)) continue;
    const skus = new Set(s.rows.map((p) => p.sku_id));
    const supply = [...skus].some((k) => (P.wh.get(k)?.on_hand ?? 0) > 0 || (P.inbound.get(k) ?? []).some((r) => r.date <= addDays(TODAY, STARVED_INBOUND_DAYS)));
    if (!supply) continue;
    starvedCount++;
    const fix = moves.filter((m) => m.style_id === s.style_id && m.type === 'WH_TO_STORE');
    if (!fix.length) continue;
    const storesHit = [...new Set(fix.map((m) => m.to))];
    const hitRows = s.rows.filter((p) => storesHit.includes(p.store_id));
    // shelf days per store in the last 21 days = average over its sizes; then averaged over stores
    const shelf = storesHit.map((st) => {
      const rs = hitRows.filter((p) => p.store_id === st);
      return rs.length ? sumArr(rs.map((p) => sumArr(p.v.weekly_days.slice(nW - 3)))) / rs.length : 0;
    });
    // Days it could have been on the shelf in the last 21: not before the style launched or the store opened.
    const launch = c.items.get(s.rows[0].sku_id)!.launch_date, from21 = addDays(AS_OF, -20);
    const possible = storesHit.map((st) => {
      const start = [from21, launch, c.storeById.get(st)!.opened_on].reduce((x, y) => (y > x ? y : x));
      return Math.max(0, daysBetween(start, AS_OF) + 1);
    });
    const avgPossible = Math.round(sumArr(possible) / possible.length);
    const shelfOf = avgPossible >= 21 ? 'the last 21 days' : `a possible ${avgPossible} days (some stores opened or the style launched within 21 days)`;
    const perStoreRate = storesHit.map((st) => hitRows.filter((p) => p.store_id === st).reduce((a, p) => a + p.velocity, 0));
    push('STARVED_BESTSELLER', {
      tag: 'Best-seller running out',
      title: `${s.name} is selling out across ${storesHit.length} stores`,
      seen: `On the shelf on average only ${Math.round(sumArr(shelf) / shelf.length)} of ${shelfOf} at ${storesHit.length} stores, while it sells ${rate(sumArr(perStoreRate) / perStoreRate.length)} a day per store when it is there.`,
      fix: fixLine(fix),
      subject: { style_id: s.style_id },
      move_ids: fix.map((m) => m.id), impact_inr: priority(fix), chart: chartFor(s),
    });
  }

  // P2 DATA_FLAG (always kept) and OVER_CAPACITY (on trusted counts)
  for (const f of P.flags) {
    const st = stores.find((x) => x.store_id === f.store_id)!;
    const it = c.items.get(f.sku_id)!;
    const gap = Math.abs(f.on_hand - (f.last_weekly_closing ?? 0));
    const fill = Math.round((100 * st.stock_now) / st.capacity);
    push('DATA_FLAG', {
      tag: 'Stock count looks wrong',
      title: `${it.style_name} (${it.size}) count at ${where(f.store_id)} does not add up`,
      seen: `The count shows ${f.on_hand} pieces${f.last_weekly_closing != null ? ` but last Saturday closed at ${f.last_weekly_closing}` : ''}${fill > 100 ? `; that puts the store at ${fill}% of its space` : ''}.`,
      fix: `Recount ${f.sku_id} at ${f.store_id}. We left it out of every move until then.`,
      subject: { store_id: f.store_id, sku_id: f.sku_id },
      move_ids: [], impact_inr: gap * it.mrp,
    });
  }
  for (const st of stores) {
    const sp = P.byStore.get(st.store_id)!;
    const trusted = sp.store_units + sp.store_in_transit;
    if (trusted <= st.capacity) continue;
    const fix = moves.filter((m) => m.from === st.store_id && m.type === 'PULL_BACK');
    push('OVER_CAPACITY', {
      tag: 'Store too full',
      title: `${where(st.store_id)} holds more than it has space for`,
      seen: `${trusted} pieces on hand and arriving for ${st.capacity} spaces (${Math.round((100 * trusted) / st.capacity)}%).`,
      fix: fix.length ? fixLine(fix) : 'No safe pull-back found; review the slowest stock by hand.',
      subject: { store_id: st.store_id }, move_ids: fix.map((m) => m.id), impact_inr: priority(fix),
    });
  }

  // P3 UNDER_STOCKED_STORE and P4 NEW_STORE
  for (const st of stores) {
    const fill = st.stock_now / st.capacity;
    const inbound = moves.filter((m) => m.to === st.store_id);
    const age = daysBetween(st.opened_on, AS_OF);
    if (age < NEW_STORE_DAYS) {
      const short = st.categories.filter((x) => x.now < x.min_display);
      push('NEW_STORE', {
        tag: 'New store',
        title: `${where(st.store_id)} opened ${age} days ago and is still filling up`,
        seen: `Opened ${shortDate(st.opened_on)} with little sales history, so we plan from similar ${st.tier} stores. ${st.sold_out_with_demand} items that should sell are sold out${short.length ? `; ${short.map((x) => `${x.category} ${x.now} of ${x.min_display} minimum`).join(', ')}` : ''}.`,
        fix: inbound.length ? fixLine(inbound) : 'Nothing to send today.',
        subject: { store_id: st.store_id }, move_ids: inbound.map((m) => m.id), impact_inr: priority(inbound) + st.at_risk_week_inr,
      });
    } else if (fill < UNDER_STOCKED_FILL && st.sold_out_with_demand >= UNDER_STOCKED_SOLD_OUT && inbound.length) {
      push('UNDER_STOCKED_STORE', {
        tag: 'Store running empty',
        title: `${where(st.store_id)} is at ${Math.round(fill * 100)}% of its space`,
        seen: `Only ${st.stock_now} pieces for ${st.capacity} spaces, and ${st.sold_out_with_demand} items that still sell are sold out (about ${fmtInr(st.at_risk_week_inr)} of sales a week).`,
        fix: fixLine(inbound),
        subject: { store_id: st.store_id }, move_ids: inbound.map((m) => m.id), impact_inr: priority(inbound) + st.at_risk_week_inr,
      });
    }
  }

  // P5 TRULY_SLOW (style)
  const rated = [...styles.values()].filter((s) => s.instock > 0).map((s) => ({ s, r: s.units12 / s.instock })).sort((a, b) => a.r - b.r);
  const bottom = new Set(rated.slice(0, Math.max(1, Math.ceil(rated.length * SLOW_BOTTOM_SHARE))).map((x) => x.s.style_id));
  for (const s of styles.values()) {
    if (!bottom.has(s.style_id)) continue;
    const holding = new Set(s.rows.filter((p) => p.instock_days > 0).map((p) => p.store_id));
    const oldest = Math.max(0, ...s.rows.map((p) => p.stock_age_days ?? 0));
    if (s.instock < SLOW_SHELF_DAYS_PER_STORE * holding.size || oldest < AGE_DAYS) continue;
    const fix = moves.filter((m) => m.style_id === s.style_id && (m.type === 'PULL_BACK' || m.trigger === 'AGEING'));
    if (!fix.length) continue;
    push('TRULY_SLOW', {
      tag: 'Slow seller',
      title: `${s.name} is not selling anywhere`,
      seen: `On the shelf ${s.instock} size-days across ${holding.size} stores and sold ${s.units12} pieces in 12 weeks; oldest stock is ${oldest} days old.`,
      fix: fixLine(fix),
      subject: { style_id: s.style_id }, move_ids: fix.map((m) => m.id), impact_inr: priority(fix), chart: chartFor(s),
    });
  }

  // P6 LAUNCH_RAMP (style)
  for (const s of styles.values()) {
    const it = c.items.get(s.rows[0].sku_id)!;
    if (daysBetween(it.launch_date, AS_OF) > LAUNCH_DAYS) continue;
    const u = s.units;
    if (!(u[nW - 4] < u[nW - 3] && u[nW - 3] < u[nW - 2] && u[nW - 2] < u[nW - 1])) continue;
    const fix = moves.filter((m) => m.style_id === s.style_id && m.type === 'WH_TO_STORE');
    if (!fix.length) continue;
    push('LAUNCH_RAMP', {
      tag: 'New launch picking up',
      title: `${s.name} sales are climbing ${daysBetween(it.launch_date, AS_OF)} days after launch`,
      seen: `Launched ${shortDate(it.launch_date)}; pieces sold a week went ${u.slice(nW - 4).join(' → ')} over the last 4 weeks.`,
      fix: fixLine(fix),
      subject: { style_id: s.style_id }, move_ids: fix.map((m) => m.id), impact_inr: priority(fix), chart: chartFor(s),
    });
  }

  // Rank by impact; data flags always kept, then the best of the rest up to PROBLEMS_SHOWN.
  const byImpact = (a: Candidate, b: Candidate) => b.impact_inr - a.impact_inr || a.title.localeCompare(b.title);
  const flags = cands.filter((x) => x.kind === 'DATA_FLAG');
  const rest = cands.filter((x) => x.kind !== 'DATA_FLAG').sort(byImpact).slice(0, Math.max(0, PROBLEMS_SHOWN - flags.length));
  const signoff = new Set(moves.filter((m) => m.needs_signoff).map((m) => m.id));
  const problems = [...rest, ...flags].sort(byImpact).map((x, i): Problem => ({
    id: `P${i + 1}`, rank: i + 1, ...x, impact_inr: Math.round(x.impact_inr),
    needs_signoff_count: x.move_ids.filter((id) => signoff.has(id)).length,
  }));
  return { problems, starved_bestseller: starvedCount };
}
