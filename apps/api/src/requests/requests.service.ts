import { ConflictException, BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { join } from 'path';
import type { DeclineReason, Move, RequestStatus, Role, SourceOption, SourcesReply, TransferRequest } from '@sm/contract';
import { DbService } from '../db/db.service';
import { GeoService } from '../geo/geo.service';
import { StoresService } from '../stores/stores.service';
import { StockService } from '../stock/stock.service';
import { RunsService } from '../runs/runs.service';
import { loadData } from '../engine/data';
import { buildPositions, type Positions } from '../engine/position';
import { key, leadTime, storeDistance } from '../engine/clean';
import { canSpare, type Pending } from '../engine/spare';
import { findViolations } from '../engine/validate';
import { addDays } from '../engine/dates';
import { SIGNOFF_INR, TODAY, WAREHOUSE_ID } from '../engine/params';

// apps/api/dist/requests -> repo root; same depth from src/requests under ts-node.
const DATA_DIR = join(__dirname, '..', '..', '..', '..', 'data', 'csv');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECLINE: DeclineReason[] = ['need_it_here', 'count_wrong', 'other'];
const BLOCKED_TEXT = {
  flagship_top20: 'is a flagship and this style is in its top 20',
  under_30_days: 'would drop under 30 days of cover',
  under_display_min: 'would drop under its display minimum',
  none_in_stock: 'has none in stock',
};

/** Who is acting: the signed-in user, or nobody (sign-in off: the demo acts as the store in `location`). */
export type Actor = { id: string | null; role: Role | null; location: string };

type Row = {
  id: string; from_location: string; to_location: string; status: RequestStatus; value_mrp: number; needs_signoff: boolean;
  reason: string | null; approved_at: Date | null; created_at: Date; updated_at: Date; sku_id: string; qty: number;
};
const SELECT = `select r.*, l.sku_id, l.qty from transfer_requests r join transfer_lines l on l.request_id = r.id`;
const err = (message: string) => ({ error: message, message });

@Injectable()
export class RequestsService {
  private P: Positions | null = null;

  constructor(
    private readonly db: DbService,
    private readonly geo: GeoService,
    private readonly stores: StoresService,
    private readonly stock: StockService,
    private readonly runs: RunsService,
  ) {
    // Stores, locations or receipts may have changed: rebuild positions on the next call.
    runs.onRunFinished(() => (this.P = null));
  }

  /** Same positions the engine uses (snapshot + receipts + added stores), cached until the next run. */
  private positions(): Positions {
    return (this.P ??= buildPositions(loadData(DATA_DIR, this.stores.extraStores()), this.geo.locations(), this.stock.receipts(), this.stock.extraItems()));
  }

  /** Every request not declined or cancelled has taken its pieces off the giver (rule 3: never send twice). */
  private pending(exceptId: string | null = null): Promise<Pending[]> {
    return this.db.query<Pending>(
      `select r.from_location as "from", r.to_location as "to", l.sku_id, l.qty from transfer_requests r
         join transfer_lines l on l.request_id = r.id
        where r.status not in ('declined', 'cancelled') and ($1::uuid is null or r.id <> $1::uuid)`,
      [exceptId],
    );
  }

  private name(id: string) {
    return id === WAREHOUSE_ID ? 'Warehouse Kolkata' : `${this.positions().c.storeById.get(id)?.city ?? ''} ${id}`.trim();
  }

  private days(from: string, to: string) {
    const { c } = this.positions();
    return leadTime(from, to, c.storeById, c.leadTimes);
  }

  private store(id: unknown, what: string): string {
    const s = typeof id === 'string' ? id.trim().toUpperCase() : '';
    if (!this.positions().c.storeById.has(s)) throw new BadRequestException(err(`Unknown ${what} ${s || '(none)'}`));
    return s;
  }

  private sku(id: unknown): string {
    const s = typeof id === 'string' ? id.trim().toUpperCase() : '';
    if (!this.positions().c.items.has(s)) throw new BadRequestException(err(`Unknown SKU ${s || '(none)'}`));
    return s;
  }

  async sources(toId: string, skuId: unknown): Promise<SourcesReply> {
    const P = this.positions();
    const to = this.store(toId, 'store');
    const sku = this.sku(skuId);
    const pending = await this.pending();
    const option = (id: string): SourceOption | null => {
      const s = canSpare(P, id, to, sku, pending);
      if (!s) return null;
      return {
        location_id: id, name: this.name(id), km: storeDistance(id, to, P.c.locations)?.km ?? 0, days: this.days(id, to),
        can_spare: s.can_spare, closest: false, blocked_reason: s.blocked_reason,
      };
    };
    const rows = [...P.c.storeById.keys()].map(option).filter((r): r is SourceOption => r !== null);
    rows.sort((a, b) => a.days - b.days || a.km - b.km || b.can_spare - a.can_spare);
    const first = rows.find((r) => !r.blocked_reason && r.can_spare > 0);
    if (first) first.closest = true;
    const wh = option(WAREHOUSE_ID);
    if (wh) rows.push(wh);
    const own = P.rows.get(key(to, sku));
    return { sources: rows, on_hand: own?.on_hand ?? 0, per_week: Math.round((own?.velocity ?? 0) * 70) / 10 };
  }

  async list(a: Actor, box: unknown): Promise<TransferRequest[]> {
    if (box !== 'incoming' && box !== 'mine') throw new BadRequestException(err('box must be incoming or mine'));
    const rows = await this.db.query<Row>(
      box === 'mine'
        ? `${SELECT} where r.to_location = $1 order by r.created_at desc limit 200`
        : // The super admin also signs off any request over ₹1,00,000.
          `${SELECT} where r.from_location = $1 or ($2 and r.status = 'needs_signoff') order by r.created_at desc limit 200`,
      box === 'mine' ? [a.location] : [a.location, a.role === 'super_admin'],
    );
    return rows.map((r) => this.view(r));
  }

  async create(a: Actor, body: { sku_id?: unknown; qty?: unknown; from_location?: unknown }): Promise<TransferRequest> {
    const P = this.positions();
    const to = this.store(a.location, 'store');
    const sku = this.sku(body.sku_id);
    const qty = Number(body.qty);
    if (!Number.isInteger(qty) || qty < 1) throw new BadRequestException(err('qty must be a whole number of pieces, 1 or more'));
    const from = typeof body.from_location === 'string' ? body.from_location.trim().toUpperCase() : '';
    if (from !== WAREHOUSE_ID) this.store(from, 'giving store');
    if (from === to) throw new BadRequestException(err('Pick another store to ask'));
    this.checkSpare(from, to, sku, qty, await this.pending());
    const value = qty * P.c.items.get(sku)!.mrp;
    const [row] = await this.db.query<Row>(
      `with r as (
         insert into transfer_requests (from_location, to_location, status, requested_by, value_mrp, needs_signoff)
         values ($1, $2, 'waiting', $3::uuid, $4, $5) returning *),
       l as (insert into transfer_lines (request_id, sku_id, qty) select id, $6, $7 from r),
       e as (insert into transfer_events (request_id, actor, from_status, to_status) select id, $3::uuid, null, 'waiting' from r)
       select r.*, $6::text as sku_id, $7::int as qty from r`,
      [from, to, a.id, value, value > SIGNOFF_INR, sku, qty],
    );
    return this.view(row);
  }

  /** Giving store's manager (WH-KOL: super admin). Over ₹1,00,000 → needs_signoff first. */
  async approve(a: Actor, id: string) {
    const r = await this.get(id);
    this.mayGive(a, r);
    if (r.status !== 'waiting') return this.settled(r, ['needs_signoff', 'approved']);
    await this.recheck(r);
    return this.step(r, a, r.needs_signoff ? 'needs_signoff' : 'approved', r.needs_signoff ? ', decided_by = $4' : ', decided_by = $4, approved_at = now()');
  }

  async signoff(a: Actor, id: string) {
    if (a.role && a.role !== 'super_admin') throw new ForbiddenException(err('Only the super admin signs off requests over ₹1,00,000'));
    const r = await this.get(id);
    if (r.status !== 'needs_signoff') return this.settled(r, ['approved']);
    await this.recheck(r);
    return this.step(r, a, 'approved', ', signed_off_by = $4, approved_at = now()');
  }

  async decline(a: Actor, id: string, reason: unknown) {
    if (!DECLINE.includes(reason as DeclineReason)) throw new BadRequestException(err(`reason must be one of ${DECLINE.join(', ')}`));
    const r = await this.get(id);
    this.mayGive(a, r);
    if (r.status !== 'waiting' && r.status !== 'needs_signoff') return this.settled(r, ['declined']);
    return this.step(r, a, 'declined', ', decided_by = $4, reason = $5', reason as string);
  }

  async cancel(a: Actor, id: string) {
    const r = await this.get(id);
    if (a.role === 'store_manager' && a.location !== r.to_location) throw new ForbiddenException(err('Only the asking store can cancel'));
    if (r.status !== 'waiting') return this.settled(r, ['cancelled']);
    return this.step(r, a, 'cancelled', '');
  }

  /**
   * A super admin approved a store-to-store move on the daily list: it becomes an approved transfer with a shipment,
   * so the giving store sees it under Going out (and gives it to a driver) and the receiving store under Coming in.
   * Once per run + move: approving again returns the same transfer. The move already passed the engine validator
   * in its run. Warehouse moves are not tracked yet.
   */
  async fromEngineMove(a: Actor, moveId: unknown) {
    if (a.role !== 'super_admin' || !a.id) throw new ForbiddenException(err('Only a super admin can send a move from the daily list'));
    const run = await this.runs.latest({ all: true });
    const want = typeof moveId === 'string' ? moveId.trim().toUpperCase() : '';
    const m = run?.moves.moves.find((x) => x.id === want);
    if (!run || !m) throw new NotFoundException(err("No such move on today's list"));
    if (m.type !== 'STORE_TO_STORE') throw new BadRequestException(err('Delivery tracking for warehouse moves is coming soon'));
    const tag = `${run.run_id}:${m.id}`;
    const find = () => this.db.query<Row>(`${SELECT} where r.engine_move_id = $1`, [tag]);
    const [had] = await find();
    if (had) return this.view(had);
    // Rule 3: open requests made since the run may already have taken these pieces off the giver.
    const left = canSpare(this.positions(), m.from, m.to, m.sku_id, await this.pending())?.on_hand ?? 0;
    if (left < m.qty) throw new ConflictException(err(`${m.from} has ${Math.max(0, left)} of ${m.sku_id} left after open requests; this move needs ${m.qty}`));
    try {
      const [row] = await this.db.query<Row>(
        `with r as (
           insert into transfer_requests (from_location, to_location, status, requested_by, decided_by, signed_off_by,
                                          value_mrp, needs_signoff, engine_move_id, approved_at)
           values ($1::text, $2::text, 'approved', $3::uuid, $3::uuid, $4::uuid, $5::int, $6::boolean, $7::text, now())
           returning *),
         l as (insert into transfer_lines (request_id, sku_id, qty) select id, $8::text, $9::int from r),
         e as (insert into transfer_events (request_id, actor, from_status, to_status, note)
               select id, $3::uuid, null, 'approved', $10::text from r),
         s as (insert into shipments (request_id) select id from r)
         select r.*, $8::text as sku_id, $9::int as qty from r`,
        [m.from, m.to, a.id, m.needs_signoff ? a.id : null, Math.round(m.value_inr), m.needs_signoff, tag, m.sku_id, m.qty,
         `Daily list ${m.id}: ${m.reason}`.slice(0, 500)],
      );
      return this.view(row);
    } catch (e) {
      // Approve pressed twice at once: the unique index lets one through; return that one.
      if ((e as { code?: string }).code !== '23505') throw e;
      const [again] = await find();
      if (again) return this.view(again);
      throw e;
    }
  }

  private async get(id: string): Promise<Row> {
    const [r] = UUID.test(id) ? await this.db.query<Row>(`${SELECT} where r.id = $1`, [id]) : [];
    if (!r) throw new NotFoundException(err('No such request'));
    return r;
  }

  private mayGive(a: Actor, r: Row) {
    if (!a.role || a.role === 'super_admin') return; // sign-in off: demo may act for any store
    if (r.from_location === WAREHOUSE_ID) throw new ForbiddenException(err('The super admin approves warehouse requests'));
    if (a.location !== r.from_location) throw new ForbiddenException(err(`Only ${r.from_location}'s manager can answer this request`));
  }

  /** Clicked twice: the same answer again changes nothing; anything else is a conflict. */
  private settled(r: Row, same: RequestStatus[]) {
    if (same.includes(r.status)) return this.view(r);
    throw new ConflictException(err(`This request is already ${r.status.replace('_', ' ')}`));
  }

  private checkSpare(from: string, to: string, sku: string, qty: number, pending: Pending[]) {
    const s = canSpare(this.positions(), from, to, sku, pending);
    if (!s || s.blocked_reason) throw new ConflictException(err(`${from} ${BLOCKED_TEXT[s?.blocked_reason ?? 'none_in_stock']}`));
    if (qty > s.can_spare) throw new ConflictException(err(`${from} can give ${s.can_spare} now`));
  }

  /** Stock may have moved since the ask: can_spare again (other open requests counted), then the engine validator on the move. */
  private async recheck(r: Row) {
    this.checkSpare(r.from_location, r.to_location, r.sku_id, r.qty, await this.pending(r.id));
    const P = this.positions();
    const it = P.c.items.get(r.sku_id)!;
    const lead = this.days(r.from_location, r.to_location);
    const side = { on_hand: 0, in_transit: 0, velocity: 0, cover_days: null };
    const store = r.from_location !== WAREHOUSE_ID;
    const move: Move = {
      id: `REQ-${r.id}`, type: store ? 'STORE_TO_STORE' : 'WH_TO_STORE', trigger: 'LOW_COVER',
      sku_id: r.sku_id, style_id: it.style_id, style_name: it.style_name, category: it.category, size: it.size, mrp: it.mrp,
      from: r.from_location, to: r.to_location, qty: r.qty, lead_time_days: lead, arrives_on: addDays(TODAY, lead),
      reason: `Asked for by ${r.to_location}`, from_before: side, from_after: side, to_before: side, to_after: side,
      priority: 0, value_inr: r.value_mrp, needs_signoff: r.needs_signoff, velocity_basis: 'own', stock_age_days: null,
      checks: { min_display: true, capacity: true, flagship: true, in_transit: true, donor_cover_30: true },
      distance_km: store ? storeDistance(r.from_location, r.to_location, P.c.locations)?.km ?? null : null,
      travel_days: store ? lead : null, alternatives: [],
    };
    // `in_transit` there means "the engine's 45-day target is already met"; a manager asking is the demand signal,
    // and rule 3 (never send twice) is kept by counting every open request in can_spare above.
    const v = findViolations(P, [move]).filter((x) => x.rule !== 'in_transit');
    if (v.length) throw new ConflictException(err(`Can't approve: ${v.map((x) => x.detail).join('; ')}`));
  }

  /** One status change: update only if still in the status we read, log the event, create the shipment on approval. */
  private async step(r: Row, a: Actor, to: RequestStatus, set: string, note: string | null = null) {
    const [row] = await this.db.query<Row>(
      `with u as (update transfer_requests set status = $3, updated_at = now()${set} where id = $1 and status = $2 returning *),
       e as (insert into transfer_events (request_id, actor, from_status, to_status, note) select id, $4::uuid, $2, $3, $5 from u),
       s as (insert into shipments (request_id) select id from u where u.status = 'approved' on conflict (request_id) do nothing)
       select u.*, $6::text as sku_id, $7::int as qty from u`,
      [r.id, r.status, to, a.id, note, r.sku_id, r.qty],
    );
    if (row) return this.view(row);
    return this.settled(await this.get(r.id), [to]);
  }

  private view(r: Row): TransferRequest {
    const P = this.positions();
    const it = P.c.items.get(r.sku_id);
    const days = this.days(r.from_location, r.to_location);
    const giver = P.rows.get(key(r.from_location, r.sku_id));
    const iso = (d: Date) => new Date(d).toISOString();
    return {
      id: r.id, sku_id: r.sku_id, style_name: it?.style_name ?? r.sku_id, size: it?.size ?? '', qty: r.qty,
      from_location: r.from_location, to_location: r.to_location, status: r.status,
      value_mrp: r.value_mrp, needs_signoff: r.needs_signoff, reason: r.reason,
      created_at: iso(r.created_at), updated_at: iso(r.updated_at),
      days, due_on: r.approved_at ? addDays(iso(r.approved_at).slice(0, 10), days) : null,
      giver_on_hand: r.from_location === WAREHOUSE_ID ? P.wh.get(r.sku_id)?.on_hand ?? 0 : giver?.on_hand ?? 0,
      giver_cover_days_after: giver && giver.velocity > 0 ? Math.round(((giver.available - r.qty) / giver.velocity) * 10) / 10 : null,
    };
  }
}
