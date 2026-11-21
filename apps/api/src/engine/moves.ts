// Move generation (docs/02-engine.md §3). Deterministic: same positions in → same moves out.
import type { Blocked, Flag, Move, MoveTrigger, MoveType, Side } from '@sm/contract';
import { displayCategory, key, leadTime, storeDistance } from './clean';
import type { Position, Positions } from './position';
import {
  AGE_COVER, AGE_DAYS, REORDER_COVER, JUMP_AHEAD_MIN_COVER, BASIS_OWN_DAYS, DONOR_KEEP, MIN_DONOR_COVER, MIN_NEED_VELOCITY, MIN_PULL_BACK,
  MIN_STORE_MOVE, SIGNOFF_INR, STOCKOUT_DAYS, TARGET_COVER, TODAY, WAREHOUSE_ID, WINDOW_DAYS,
} from './params';
import { addDays } from './dates';
import * as R from './reasons';
import { ageingPriority, restockPriority } from './priority';

const TIER_RANK: Record<string, number> = { 'S++': 4, 'S+': 3, A: 2, B: 1 };

export type GenerateResult = { moves: Move[]; flags: Flag[]; blocked: Blocked };

/** Running ledger of planned ins/outs so each step sees the earlier ones. */
class Ledger {
  inQ = new Map<string, number>(); // store|sku → planned in
  outQ = new Map<string, number>(); // store|sku → planned out
  storeIn = new Map<string, number>();
  storeOut = new Map<string, number>();
  catOut = new Map<string, number>(); // store|category → planned out
  catIn = new Map<string, number>();
  whOut = new Map<string, number>(); // sku → planned out of WH
  whIn = new Map<string, number>(); // sku → pulled back into WH

  constructor(private P: Positions) {}

  private add(m: Map<string, number>, k: string, q: number) { m.set(k, (m.get(k) ?? 0) + q); }
  get = (m: Map<string, number>, k: string) => m.get(k) ?? 0;

  /** on_hand still physically at the store after planned outs */
  onHand(p: Position) { return p.on_hand - this.get(this.outQ, key(p.store_id, p.sku_id)); }
  /** available = on_hand + in_transit + planned in − planned out */
  avail(p: Position) { const k = key(p.store_id, p.sku_id); return p.available + this.get(this.inQ, k) - this.get(this.outQ, k); }
  cover(p: Position, extra = 0) { return p.velocity > 0 ? (this.avail(p) + extra) / p.velocity : null; }
  need(p: Position) { return Math.max(0, p.target_units - this.avail(p)); }
  whLeft(sku: string) { return (this.P.wh.get(sku)?.on_hand ?? 0) - this.get(this.whOut, sku); }
  /** store load for the capacity rule: units + in transit + planned in − planned out */
  load(store: string) {
    const s = this.P.byStore.get(store)!;
    return s.store_units + s.store_in_transit + this.get(this.storeIn, store) - this.get(this.storeOut, store);
  }
  room(store: string) { return this.P.byStore.get(store)!.capacity - this.load(store); }
  /** how many pieces of this category may leave without going under min display */
  catHeadroom(store: string, cat: string) {
    const s = this.P.byStore.get(store)!;
    return (s.cat_units[cat] ?? 0) - this.get(this.catOut, key(store, cat)) - (s.min_display[cat] ?? 0);
  }
  catNow(store: string, cat: string) {
    const s = this.P.byStore.get(store)!;
    return (s.cat_units[cat] ?? 0) - this.get(this.catOut, key(store, cat)) + this.get(this.catIn, key(store, cat));
  }

  moveOut(from: string, p: Position | null, sku: string, cat: string, q: number) {
    if (from === WAREHOUSE_ID) return this.add(this.whOut, sku, q);
    this.add(this.outQ, key(from, sku), q);
    this.add(this.storeOut, from, q);
    this.add(this.catOut, key(from, cat), q);
  }
  moveIn(to: string, sku: string, cat: string, q: number) {
    if (to === WAREHOUSE_ID) return this.add(this.whIn, sku, q);
    this.add(this.inQ, key(to, sku), q);
    this.add(this.storeIn, to, q);
    this.add(this.catIn, key(to, cat), q);
  }
}

export function generateMoves(P: Positions): GenerateResult {
  const { c } = P;
  const L = new Ledger(P);
  const moves: Move[] = [];
  const flags: Flag[] = [];
  const blocked: Blocked = { donor_cover_30: 0, flagship: 0, min_display: 0, capacity: 0, in_transit: 0 };
  const flagSeen = new Set<string>();
  const flag = (kind: Flag['kind'], store_id: string, sku_id: string, note: string) => {
    const k = `${kind}|${store_id}|${sku_id}`;
    if (flagSeen.has(k)) return;
    flagSeen.add(k);
    flags.push({ kind, store_id, sku_id, note });
  };
  const lt = (from: string, to: string) => leadTime(from, to, c.storeById, c.leadTimes, c.locations);

  type Ranked = { r: Position; km: number | null; days: number; jumped?: Ranked };
  const altOf = (x: Ranked) => ({ store_id: x.r.store_id, distance_km: x.km ?? 0, travel_days: x.days });
  /**
   * Receivers for pieces leaving `from`, nearest first (#25): travel days, km, lowest cover, higher velocity.
   * Guard: a fully-out store (cover 0, velocity > 0) jumps ahead of a closer store with ≥ JUMP_AHEAD_MIN_COVER days.
   */
  const orderReceivers = (from: string, list: Position[]): Ranked[] => {
    const rest: Ranked[] = list.map((r) => {
      const d = storeDistance(from, r.store_id, c.locations);
      return { r, km: d?.km ?? null, days: lt(from, r.store_id) };
    }).sort((a, b) => a.days - b.days || (a.km ?? 0) - (b.km ?? 0) || (L.cover(a.r) ?? 0) - (L.cover(b.r) ?? 0) ||
      b.r.velocity - a.r.velocity || a.r.store_id.localeCompare(b.r.store_id));
    const out: Ranked[] = [];
    const fullyOut = (x: Ranked) => L.avail(x.r) <= 0 && x.r.velocity > 0;
    while (rest.length) {
      let i = 0;
      if ((L.cover(rest[0].r) ?? Infinity) >= JUMP_AHEAD_MIN_COVER) {
        const j = rest.findIndex(fullyOut);
        if (j > 0) { i = j; rest[j].jumped = rest[0]; }
      }
      out.push(rest.splice(i, 1)[0]);
    }
    return out;
  };
  const isProtected = (store: string, style: string) => c.storeById.get(store)!.tier === 'S++' && c.protectedStyles.has(key(store, style));

  // Rows grouped by SKU, in a stable order.
  const bySku = new Map<string, Position[]>();
  for (const p of [...P.rows.values()].sort((a, b) => a.store_id.localeCompare(b.store_id) || a.sku_id.localeCompare(b.sku_id))) {
    if (!bySku.has(p.sku_id)) bySku.set(p.sku_id, []);
    bySku.get(p.sku_id)!.push(p);
  }
  const skus = [...bySku.keys()].sort();
  const row = (store: string, sku: string) => P.rows.get(key(store, sku));
  const netVelocity = (sku: string) => {
    const rs = bySku.get(sku) ?? [];
    return rs.length ? rs.reduce((a, p) => a + p.velocity, 0) / rs.length : 0;
  };

  const side = (loc: string, p: Position | null, sku: string): Side => {
    if (loc === WAREHOUSE_ID) return { on_hand: L.whLeft(sku) + L.get(L.whIn, sku), in_transit: 0, velocity: 0, cover_days: null };
    if (!p) return { on_hand: 0, in_transit: 0, velocity: 0, cover_days: null };
    const k = key(p.store_id, p.sku_id);
    const cover = round(p.velocity, 3) > 0 ? L.cover(p) : null; // shown velocity 0 → "no sales", not 21,000 days
    return {
      on_hand: L.onHand(p), in_transit: p.in_transit + L.get(L.inQ, k), velocity: round(p.velocity, 3),
      cover_days: cover == null ? null : round(cover, 1),
    };
  };

  /** Records the move, updates the ledger, fills before/after sides. */
  const emit = (a: {
    type: MoveType; trigger: MoveTrigger; sku: string; from: string; to: string; qty: number;
    geo?: Pick<Move, 'distance_km' | 'travel_days' | 'alternatives'>;
    reason: (x: { lead: number; arrives: string; fromAfter: Side; toAfter: Side; fromBefore: Side; toBefore: Side }) => string;
    priority: (x: { lead: number }) => number;
  }) => {
    const it = c.items.get(a.sku)!;
    const fromP = a.from === WAREHOUSE_ID ? null : row(a.from, a.sku)!;
    const toP = a.to === WAREHOUSE_ID ? null : row(a.to, a.sku) ?? null;
    const lead = a.to === WAREHOUSE_ID ? lt(WAREHOUSE_ID, a.from) : lt(a.from, a.to); // pull-backs: WH lane, reversed
    const arrives = addDays(TODAY, lead);
    const fromBefore = side(a.from, fromP, a.sku), toBefore = side(a.to, toP, a.sku);
    const cat = displayCategory(it.category);
    L.moveOut(a.from, fromP, a.sku, cat, a.qty);
    L.moveIn(a.to, a.sku, cat, a.qty);
    const fromAfter = side(a.from, fromP, a.sku), toAfter = side(a.to, toP, a.sku);
    const value = a.qty * it.mrp;
    const src = fromP ?? null;
    moves.push({
      id: '', type: a.type, trigger: a.trigger,
      sku_id: a.sku, style_id: it.style_id, style_name: it.style_name, category: it.category, size: it.size, mrp: it.mrp,
      from: a.from, to: a.to, qty: a.qty, lead_time_days: lead, arrives_on: arrives,
      reason: a.reason({ lead, arrives, fromAfter, toAfter, fromBefore, toBefore }),
      from_before: fromBefore, from_after: fromAfter, to_before: toBefore, to_after: toAfter,
      priority: a.priority({ lead }), value_inr: value, needs_signoff: value > SIGNOFF_INR,
      velocity_basis: (toP ?? src)?.basis ?? 'peer',
      stock_age_days: src ? src.stock_age_days : P.wh.get(a.sku)?.stock_age_days ?? null,
      checks: { min_display: false, capacity: false, flagship: false, in_transit: false, donor_cover_30: false },
      distance_km: a.geo?.distance_km ?? null, travel_days: a.geo?.travel_days ?? null, alternatives: a.geo?.alternatives ?? [],
    });
  };

  const restockTrigger = (p: Position): MoveTrigger => (p.velocity > 0 && p.instock_days < WINDOW_DAYS - STOCKOUT_DAYS ? 'STOCKOUT' : 'LOW_COVER');
  const restockReason = (p: Position, from: string, qty: number) => (x: { arrives: string; toBefore: Side; toAfter: Side }) =>
    restockTrigger(p) === 'STOCKOUT'
      ? R.stockout({
        instockDays: p.instock_days, launch: c.items.get(p.sku_id)!.launch_date, opened: c.storeById.get(p.store_id)!.opened_on, v: p.velocity, basis: p.basis,
        qty, from: from === WAREHOUSE_ID ? 'WH' : from, arrives: x.arrives,
        available: x.toBefore.on_hand + x.toBefore.in_transit, coverBefore: x.toBefore.cover_days, coverAfter: x.toAfter.cover_days,
      })
      : R.whLowCover({ v: p.velocity, basis: p.basis, available: x.toBefore.on_hand + x.toBefore.in_transit, coverBefore: x.toBefore.cover_days, qty, coverAfter: x.toAfter.cover_days, arrives: x.arrives });

  // Rule 1 outranks restocking: keep enough room for the pieces other categories still need to reach min display.
  const whHasCat = (cat: string) => [...c.items.values()].some((it) => displayCategory(it.category) === cat && L.whLeft(it.sku_id) > 0);
  const roomFor = (p: Position) => {
    const s = P.byStore.get(p.store_id)!;
    let reserve = 0;
    for (const [cat, min] of Object.entries(s.min_display)) {
      if (cat !== p.category && whHasCat(cat)) reserve += Math.max(0, min - L.catNow(p.store_id, cat));
    }
    return L.room(p.store_id) - reserve;
  };

  /** True when a store may receive (not a wrong count, has room). Counts capacity refusals. */
  const canReceive = (p: Position, q: number) => {
    if (p.flagged) return false;
    if (roomFor(p) < q) { blocked.capacity++; return false; }
    return true;
  };

  // ── D (first): over-capacity stores pull back their slowest stock ─────────────────────────
  for (const st of c.stores) {
    let over = L.load(st.store_id) - st.stock_capacity_units;
    if (over <= 0) continue;
    const s = P.byStore.get(st.store_id)!;
    const load0 = s.store_units + s.store_in_transit;
    const slow = [...P.rows.values()]
      .filter((p) => p.store_id === st.store_id && !p.flagged && p.on_hand > 0 && !isProtected(p.store_id, p.style_id))
      .sort((a, b) => a.velocity - b.velocity || (b.stock_age_days ?? 0) - (a.stock_age_days ?? 0) || a.sku_id.localeCompare(b.sku_id));
    for (const p of slow) {
      if (over <= 0) break;
      const keep = Math.ceil(p.velocity * TARGET_COVER);
      let q = Math.min(over, L.onHand(p) - keep, L.catHeadroom(p.store_id, p.category));
      if (L.catHeadroom(p.store_id, p.category) < Math.min(over, L.onHand(p) - keep)) blocked.min_display++;
      if (q <= 0) continue;
      over -= q;
      emit({
        type: 'PULL_BACK', trigger: 'OVER_CAPACITY', sku: p.sku_id, from: p.store_id, to: WAREHOUSE_ID, qty: q,
        reason: () => R.pullBackCapacity({ store: p.store_id, load: load0, capacity: st.stock_capacity_units, qty: q, v: p.velocity, age: p.stock_age_days }),
        priority: () => ageingPriority({ qty: q, mrp: p.mrp, age: p.stock_age_days }),
      });
    }
  }

  // ── C1. Ageing stock re-homed first: a store that sells it takes aged pieces before fresh WH stock.
  const ageing = [...P.rows.values()]
    .filter((p) => !p.flagged && p.on_hand > 0 && (p.stock_age_days ?? 0) >= AGE_DAYS &&
      (p.velocity > 0 ? (L.cover(p) ?? 0) >= AGE_COVER : p.instock_days >= BASIS_OWN_DAYS))
    .sort((a, b) => Number(c.items.get(a.sku_id)!.is_core_style) - Number(c.items.get(b.sku_id)!.is_core_style) ||
      b.on_hand * b.mrp - a.on_hand * a.mrp || a.store_id.localeCompare(b.store_id) || a.sku_id.localeCompare(b.sku_id));
  for (const a of ageing) {
    if (isProtected(a.store_id, a.style_id)) { blocked.flagship++; continue; }
    const keep = Math.max(Math.ceil(a.velocity * TARGET_COVER), Math.ceil(a.velocity * MIN_DONOR_COVER));
    let spare = Math.min(L.onHand(a) - keep, L.catHeadroom(a.store_id, a.category));
    if (L.catHeadroom(a.store_id, a.category) < L.onHand(a) - keep) blocked.min_display++;
    if (spare < MIN_STORE_MOVE) continue;
    const takers = orderReceivers(a.store_id, bySku.get(a.sku_id)!
      .filter((t) => t.store_id !== a.store_id && !t.flagged && t.velocity > a.velocity && t.velocity >= MIN_NEED_VELOCITY && L.need(t) >= MIN_STORE_MOVE));
    for (const o of takers) {
      const t = o.r;
      const q = Math.min(spare, L.need(t));
      if (q < MIN_STORE_MOVE) continue;
      if (!canReceive(t, q)) continue;
      emit({
        type: 'STORE_TO_STORE', trigger: 'AGEING', sku: a.sku_id, from: a.store_id, to: t.store_id, qty: q,
        geo: { distance_km: o.km, travel_days: o.days, alternatives: takers.filter((x) => x !== o).slice(0, 5).map(altOf) },
        reason: () => R.ageing({ from: a.store_id, age: a.stock_age_days!, sold: a.units_12w, instock: a.instock_days, to: t.store_id, toV: t.velocity, toBasis: t.basis, qty: q, days: o.days }),
        priority: () => ageingPriority({ qty: q, mrp: a.mrp, age: a.stock_age_days }),
      });
      spare -= q;
      if (spare < MIN_STORE_MOVE) break;
    }
  }

  // ── A. Warehouse → store ──────────────────────────────────────────────────────────────────
  const unmet = new Map<string, number>(); // store|sku → need the warehouse could not cover
  for (const sku of skus) {
    const rows = bySku.get(sku)!;
    // Rule 3: short on shelf but enough already on the way → no move.
    for (const p of rows) {
      if (p.flagged || p.velocity < MIN_NEED_VELOCITY) continue;
      if (p.in_transit > 0 && p.on_hand / p.velocity < REORDER_COVER && p.available / p.velocity >= REORDER_COVER) {
        blocked.in_transit++;
        flag('COVERED_BY_TRANSIT', p.store_id, sku, `${p.on_hand} on shelf, ${p.in_transit} arriving ${p.in_transit_arrives_on ?? 'soon'}; covers ${Math.round(p.cover_days ?? 0)} days, no move.`);
      }
    }
    // Reorder point: restock below REORDER_COVER days, fill up to TARGET_COVER.
    const needy = rows.filter((p) => !p.flagged && p.velocity >= MIN_NEED_VELOCITY && L.need(p) > 0 && (L.cover(p) ?? Infinity) < REORDER_COVER);
    if (!needy.length) continue;
    const got = new Map<string, number>();
    let wh = L.whLeft(sku);
    const totalNeed = needy.reduce((a, p) => a + L.need(p), 0);
    if (wh >= totalNeed) {
      for (const p of needy) {
        const q = L.need(p);
        if (roomFor(p) - (got.get(p.store_id) ?? 0) >= q) got.set(p.store_id, q);
        else blocked.capacity++;
      }
    } else {
      // Fair share, one piece at a time to the lowest cover after what it already got.
      const open = new Set(needy.map((p) => p.store_id));
      while (wh > 0 && open.size) {
        let best: Position | null = null, bestCover = Infinity;
        for (const p of needy) {
          if (!open.has(p.store_id)) continue;
          const g = got.get(p.store_id) ?? 0;
          if (g >= L.need(p)) { open.delete(p.store_id); continue; }
          if (roomFor(p) - g < 1) { blocked.capacity++; open.delete(p.store_id); continue; }
          const cv = (L.avail(p) + g) / p.velocity;
          if (!best || cv < bestCover - 1e-9 || (Math.abs(cv - bestCover) < 1e-9 && (p.velocity > best.velocity || (p.velocity === best.velocity && TIER_RANK[c.storeById.get(p.store_id)!.tier] > TIER_RANK[c.storeById.get(best.store_id)!.tier])))) {
            best = p; bestCover = cv;
          }
        }
        if (!best) break;
        got.set(best.store_id, (got.get(best.store_id) ?? 0) + 1);
        wh--;
      }
    }
    for (const p of needy) {
      const q = got.get(p.store_id) ?? 0;
      if (q > 0) {
        emit({
          type: 'WH_TO_STORE', trigger: restockTrigger(p), sku, from: WAREHOUSE_ID, to: p.store_id, qty: q,
          reason: restockReason(p, WAREHOUSE_ID, q),
          priority: ({ lead }) => restockPriority({ v: p.velocity, available: p.available, leadTime: lead, qty: q, mrp: p.mrp }),
        });
      }
      const left = L.need(p);
      if (left <= 0) continue;
      // WH empty, but an inbound lands at the WH before this store would sell out → wait.
      const stockoutOn = addDays(TODAY, Math.floor(L.avail(p) / p.velocity));
      const inb = (P.inbound.get(sku) ?? []).find((r) => r.date < stockoutOn);
      if (inb) {
        flag('WAIT_FOR_INBOUND', p.store_id, sku, `Warehouse gets ${inb.qty} on ${inb.date}, before this store runs out on ${stockoutOn}; wait, no store-to-store move.`);
        continue;
      }
      unmet.set(key(p.store_id, sku), left);
    }
  }

  // Min display: top up categories below minimum with that category's best sellers there.
  for (const st of c.stores) {
    const s = P.byStore.get(st.store_id)!;
    for (const [cat, min] of Object.entries(s.min_display).sort()) {
      let short = min - (L.catNow(st.store_id, cat) + 0);
      if (short <= 0) continue;
      // Best sellers there; SKUs the store never held (new store) rank by their network average velocity.
      const best = [...c.items.values()]
        .filter((it) => displayCategory(it.category) === cat && L.whLeft(it.sku_id) > 0 && !row(st.store_id, it.sku_id)?.flagged)
        .map((it) => ({ sku_id: it.sku_id, velocity: row(st.store_id, it.sku_id)?.velocity ?? netVelocity(it.sku_id) }))
        .sort((a, b) => b.velocity - a.velocity || a.sku_id.localeCompare(b.sku_id));
      const nowCat = L.catNow(st.store_id, cat);
      const plan = new Map<string, number>();
      // round-robin over best sellers so the display is not one SKU
      while (short > 0) {
        let progressed = false;
        for (const p of best) {
          if (short <= 0) break;
          const pl = plan.get(p.sku_id) ?? 0;
          if (L.whLeft(p.sku_id) - pl <= 0) continue;
          if (L.room(st.store_id) - [...plan.values()].reduce((a, b) => a + b, 0) < 1) { blocked.capacity++; short = 0; break; }
          plan.set(p.sku_id, pl + 1);
          short--;
          progressed = true;
        }
        if (!progressed) break;
      }
      for (const [sku, q] of plan) {
        const p = row(st.store_id, sku);
        const rank = best.findIndex((b) => b.sku_id === sku) + 1;
        const v = p?.velocity ?? netVelocity(sku), mrp = c.items.get(sku)!.mrp;
        emit({
          type: 'WH_TO_STORE', trigger: 'MIN_DISPLAY', sku, from: WAREHOUSE_ID, to: st.store_id, qty: q,
          reason: ({ arrives }) => R.minDisplay({ category: cat, now: nowCat, min, qty: q, v, own: !!p && p.basis !== 'peer', rank, of: best.length, whAge: P.wh.get(sku)?.stock_age_days ?? null, arrives }),
          priority: ({ lead }) => restockPriority({ v, available: p?.available ?? 0, leadTime: lead, qty: q, mrp }) + Math.round(0.1 * q * mrp),
        });
      }
    }
  }

  // ── B. Store → store for need the warehouse could not cover. Donor-driven, nearest receiver first (#25).
  const unmetBySku = new Map<string, Position[]>();
  for (const k of [...unmet.keys()].sort()) {
    const r = P.rows.get(k)!;
    if (!unmetBySku.has(r.sku_id)) unmetBySku.set(r.sku_id, []);
    unmetBySku.get(r.sku_id)!.push(r);
  }
  for (const [sku, recv] of unmetBySku) {
    const donors = bySku.get(sku)!
      .filter((d) => !d.flagged && L.onHand(d) > 0 && !unmet.has(key(d.store_id, sku)))
      .sort((a, b) => (L.cover(b) ?? Infinity) - (L.cover(a) ?? Infinity) || a.store_id.localeCompare(b.store_id));
    for (const d of donors) {
      // tiny needs (< 2) sell out before a transfer lands anyway
      const open = recv.filter((r) => r.store_id !== d.store_id && L.need(r) >= MIN_STORE_MOVE);
      if (!open.length) break;
      const ordered = orderReceivers(d.store_id, open);
      const first = ordered[0];
      const want = L.need(first.r);
      const surplus = L.onHand(d) - Math.ceil(d.velocity * DONOR_KEEP);
      // Rule 4: a donor that could hand over the whole need but would drop under 30 days → reduced/blocked.
      const naive = Math.min(want, L.onHand(d));
      if (d.velocity > 0 && naive >= MIN_STORE_MOVE && (L.avail(d) - naive) / d.velocity < MIN_DONOR_COVER) {
        blocked.donor_cover_30++;
        if (surplus < MIN_STORE_MOVE && L.onHand(d) >= want)
          flag('BLOCKED_DONOR_COVER', d.store_id, sku, `${d.store_id} holds ${L.onHand(d)} but giving ${want} to ${first.r.store_id} leaves ${R.days((L.avail(d) - want) / d.velocity)} cover (< ${MIN_DONOR_COVER}); blocked.`);
      }
      if (surplus <= 0) continue;
      if (isProtected(d.store_id, d.style_id)) {
        blocked.flagship++;
        flag('BLOCKED_FLAGSHIP', d.store_id, sku, `${d.store_id} has ${surplus} spare but ${d.style_id} is one of its top-20 protected styles; not moved to ${first.r.store_id}.`);
        continue;
      }
      // Rule 4: donor keeps ≥ 30 days of cover after the move.
      const maxBy30 = d.velocity > 0 ? Math.floor(L.avail(d) - d.velocity * MIN_DONOR_COVER) : surplus;
      let spare = Math.min(surplus, maxBy30);
      const head = L.catHeadroom(d.store_id, d.category);
      if (head < spare) { blocked.min_display++; spare = head; }
      for (const o of ordered) {
        if (spare < MIN_STORE_MOVE) break;
        const r = o.r;
        const q = Math.min(spare, L.need(r));
        if (q < MIN_STORE_MOVE) continue;
        // Drop if a warehouse delivery would reach the receiver before (or when) these pieces would.
        const inb = (P.inbound.get(sku) ?? []).find((x) => addDays(x.date, lt(WAREHOUSE_ID, r.store_id)) <= addDays(TODAY, o.days));
        if (inb) { blocked.in_transit++; continue; }
        if (!canReceive(r, q)) continue;
        const coverFrom = L.cover(d), coverTo = L.cover(r);
        const alternatives = ordered.filter((x) => x !== o).slice(0, 5).map(altOf);
        const closer = ordered.find((x) => x !== o && (x.days < o.days || (x.days === o.days && (x.km ?? 0) < (o.km ?? 0))));
        emit({
          type: 'STORE_TO_STORE', trigger: restockTrigger(r), sku, from: d.store_id, to: r.store_id, qty: q,
          geo: { distance_km: o.km, travel_days: o.days, alternatives },
          reason: ({ fromAfter }) => R.storeToStore({
            from: d.store_id, to: r.store_id, qty: q, fromCover: coverFrom, toCover: coverTo, fromAfter: fromAfter.cover_days, days: o.days, km: o.km,
            jumped: o.jumped ? { store: o.jumped.r.store_id, cover: L.cover(o.jumped.r) } : null,
            closer: closer ? { store: closer.r.store_id, days: closer.days } : null,
            farther: !closer && alternatives.length ? {
              store: alternatives[0].store_id, days: alternatives[0].travel_days, km: alternatives[0].distance_km,
              cover: L.cover(ordered.find((x) => x.r.store_id === alternatives[0].store_id)!.r),
            } : null,
          }),
          priority: ({ lead }) => restockPriority({ v: r.velocity, available: r.available, leadTime: lead, qty: q, mrp: r.mrp }),
        });
        spare -= q;
      }
    }
    for (const r of recv) {
      if (L.need(r) >= MIN_STORE_MOVE && !moves.some((m) => m.to === r.store_id && m.sku_id === r.sku_id))
        flag('NO_SOURCE', r.store_id, r.sku_id, `Needs ${L.need(r)} more (${R.rate(r.velocity)}/day) but no warehouse stock, inbound or safe donor.`);
    }
  }

  // ── C2. Ageing stock nobody wants → pull back to WH-KOL (unless it breaks min display) ────
  for (const a of ageing) {
    if (isProtected(a.store_id, a.style_id)) continue;
    const keep = Math.max(Math.ceil(a.velocity * TARGET_COVER), Math.ceil(a.velocity * MIN_DONOR_COVER));
    const q = Math.min(L.onHand(a) - keep, L.catHeadroom(a.store_id, a.category));
    if (q < MIN_PULL_BACK) continue;
    emit({
      type: 'PULL_BACK', trigger: 'AGEING', sku: a.sku_id, from: a.store_id, to: WAREHOUSE_ID, qty: q,
      reason: ({ fromBefore }) => R.pullBackAgeing({
        qty: q, age: a.stock_age_days, v: fromBefore.velocity, basis: a.basis, sold: a.units_12w, instock: a.instock_days,
        onHand: fromBefore.on_hand + fromBefore.in_transit, cover: fromBefore.cover_days,
      }),
      priority: () => ageingPriority({ qty: q, mrp: a.mrp, age: a.stock_age_days }),
    });
  }

  // Data flags: wrong counts are excluded from every move.
  for (const f of P.flags) flag('DATA_COUNT_MISMATCH', f.store_id, f.sku_id, `${f.note}; excluded from moves until recounted.`);

  moves.sort((a, b) => b.priority - a.priority || a.sku_id.localeCompare(b.sku_id) || a.to.localeCompare(b.to));
  moves.forEach((m, i) => (m.id = `M${String(i + 1).padStart(4, '0')}`));
  return { moves, flags, blocked };
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
