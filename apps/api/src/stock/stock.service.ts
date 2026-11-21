import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import type { StockCheckResult, StockCommitResult } from '@sm/contract';
import { DbService } from '../db/db.service';
import type { ExtraItem, Receipt } from '../engine/position';
import { StoresService } from '../stores/stores.service';
import {
  COLUMNS, MAX_ROWS, SAMPLE_ROWS, checkHeader, checkRows, csvLine, parseCsv, type CatalogItem, type CheckOutcome, type CheckContext,
} from './check';

// apps/api/dist/stock -> repo root.
const DATA = join(__dirname, '..', '..', '..', '..', 'data', 'csv');
const KEEP_MS = 30 * 60 * 1000;

type Kept = { result: StockCheckResult; outcome: CheckOutcome; expires: number };

@Injectable()
export class StockService implements OnModuleInit {
  private readonly catalog = new Map<string, CatalogItem>(
    (parse(readFileSync(join(DATA, 'items.csv')), { columns: true, trim: true }) as Record<string, string>[])
      .filter((r) => r.is_packaging !== '1')
      .map((r) => [r.sku_id, { sku_id: r.sku_id, style_id: r.style_id, style_name: r.style_name, category: r.category, size: r.size, mrp: Number(r.mrp) }]),
  );
  private added = new Map<string, CatalogItem>();
  private receiptRows: Receipt[] = [];
  private readonly checks = new Map<string, Kept>();

  constructor(
    private readonly db: DbService,
    private readonly stores: StoresService,
  ) {}

  async onModuleInit() {
    if (!this.db.configured) return;
    await this.db.query(`
      create table if not exists stock_receipts (
        id serial primary key, location_id text not null, sku_id text not null, qty int not null,
        received_on date not null, file_hash text not null, committed_at timestamptz not null default now()
      )`);
    await this.db.query(`create index if not exists stock_receipts_file_hash on stock_receipts (file_hash)`);
    await this.db.query(`
      create table if not exists items_added (
        sku_id text primary key, style_id text not null, style_name text not null, category text not null,
        size text not null, mrp int not null, created_at timestamptz not null default now()
      )`);
    await this.reload();
  }

  private async reload() {
    const items = await this.db.query<CatalogItem>(`select sku_id, style_id, style_name, category, size, mrp from items_added`);
    this.added = new Map(items.map((i) => [i.sku_id, i]));
    this.receiptRows = await this.db.query<Receipt>(
      `select location_id, sku_id, qty, received_on::text as received_on from stock_receipts order by id`,
    );
  }

  /** Passed to the engine on every run (EngineInput.receipts / extraItems). */
  receipts(): Receipt[] { return [...this.receiptRows]; }
  extraItems(): ExtraItem[] { return [...this.added.values()]; }

  sampleCsv(): string {
    return [csvLine([...COLUMNS]), ...SAMPLE_ROWS.map(csvLine)].join('\n') + '\n';
  }

  /** Check a whole file (CSV or .xlsx). Nothing is saved; the result is kept 30 minutes under check_id. */
  async checkFile(file: { buffer: Buffer; originalname: string } | undefined): Promise<StockCheckResult> {
    if (!file?.buffer?.length) throw new BadRequestException({ error: 'Choose a CSV or .xlsx file.' });
    const rows = /\.xlsx$/i.test(file.originalname) ? await readXlsx(file.buffer) : parseCsv(file.buffer.toString('utf8'));
    if (!rows.length) throw new BadRequestException({ error: 'The file is empty.' });
    const headerProblem = checkHeader(rows[0]);
    if (headerProblem) throw new HttpException({ error: headerProblem }, HttpStatus.UNPROCESSABLE_ENTITY);
    const data = rows.slice(1);
    if (data.length > MAX_ROWS) throw new HttpException({ error: `The file has ${data.length} rows; the limit is ${MAX_ROWS}.` }, HttpStatus.UNPROCESSABLE_ENTITY);
    const hash = createHash('sha256').update(file.buffer).digest('hex');
    return this.keep(checkRows(data, await this.context()), hash);
  }

  /** Same checks on one typed-in item. Known SKU → name, size, category and MRP are filled from the catalogue. */
  async checkRow(body: Record<string, unknown>): Promise<StockCheckResult> {
    const v = (k: string) => (body?.[k] == null ? '' : String(body[k]).trim());
    const known = this.catalog.get(v('sku_id')) ?? this.added.get(v('sku_id'));
    const cells = [
      v('location_id'), v('sku_id'), v('style_name') || known?.style_name || '', v('size') || known?.size || '',
      v('category') || known?.category || '', v('mrp_inr') || (known ? String(known.mrp) : ''), v('qty'), v('received_on'),
    ];
    const hash = createHash('sha256').update(csvLine(cells)).digest('hex');
    return this.keep(checkRows([cells], await this.context(), 1), hash);
  }

  /** Append the good rows of a check to stock_receipts. Same file twice → 409. */
  async commit(checkId: string): Promise<StockCommitResult> {
    const kept = this.get(checkId);
    if (!this.db.configured) throw new HttpException({ error: 'Database not configured' }, HttpStatus.SERVICE_UNAVAILABLE);
    const [dup] = await this.db.query(`select 1 from stock_receipts where file_hash = $1 limit 1`, [kept.result.file_hash]);
    if (dup) throw new ConflictException({ error: 'This file was already added.' });
    const good = kept.outcome.good;
    if (!good.length) throw new BadRequestException({ error: 'No rows passed the checks.' });
    const newItems = [...new Map(good.filter((g) => g.newItem && !this.catalog.has(g.sku_id)).map((g) => [g.sku_id, g.newItem!])).values()];
    await this.db.query('begin');
    try {
      for (const i of newItems) {
        await this.db.query(
          `insert into items_added (sku_id, style_id, style_name, category, size, mrp) values ($1,$2,$3,$4,$5,$6) on conflict (sku_id) do nothing`,
          [i.sku_id, i.style_id, i.style_name, i.category, i.size, i.mrp],
        );
      }
      for (const g of good) {
        await this.db.query(
          `insert into stock_receipts (location_id, sku_id, qty, received_on, file_hash) values ($1,$2,$3,$4,$5)`,
          [g.location_id, g.sku_id, g.qty, g.received_on, kept.result.file_hash],
        );
      }
      await this.db.query('commit');
    } catch (e) {
      await this.db.query('rollback');
      throw e;
    }
    this.checks.delete(checkId);
    await this.reload();
    return { receipts: good.length, pieces: good.reduce((a, g) => a + g.qty, 0), items_added: newItems.length, applies_from: 'next run' };
  }

  /** The failed rows, same columns + an error column, so the user fixes and re-uploads. */
  errorsCsv(checkId: string): string {
    const kept = this.get(checkId);
    return [csvLine([...COLUMNS, 'error']), ...kept.outcome.failed.map((f) => csvLine([...f.values, f.error]))].join('\n') + '\n';
  }

  private get(checkId: string): Kept {
    this.sweep();
    const kept = this.checks.get(checkId);
    if (!kept) throw new NotFoundException({ error: 'Check expired or not found; upload the file again.' });
    return kept;
  }

  private keep(outcome: CheckOutcome, file_hash: string): StockCheckResult {
    this.sweep();
    const check_id = randomUUID();
    const expires = Date.now() + KEEP_MS;
    const result: StockCheckResult = {
      check_id, file_hash, expires_at: new Date(expires).toISOString(),
      rows_total: outcome.rows_total, ok_rows: outcome.good.length, pieces: outcome.good.reduce((a, g) => a + g.qty, 0),
      by_location: outcome.by_location, errors: outcome.errors, warnings: outcome.warnings,
      new_skus: [...new Set(outcome.good.filter((g) => g.newItem).map((g) => g.sku_id))],
    };
    this.checks.set(check_id, { result, outcome, expires });
    return result;
  }

  private sweep() {
    const now = Date.now();
    for (const [k, v] of this.checks) if (v.expires < now) this.checks.delete(k);
  }

  /** Known locations with capacity and stock_now (latest run's store summaries, plus receipts not yet run). */
  private async context(): Promise<CheckContext> {
    const stockNow = new Map<string, number>();
    if (this.db.configured) {
      const [row] = await this.db.query<{ stores: { store_id: string; stock_now: number }[] | null }>(
        `select moves_json->'stores' as stores from runs where status = 'FINISHED' order by finished_at desc limit 1`,
      );
      for (const s of row?.stores ?? []) stockNow.set(s.store_id, s.stock_now);
    }
    const csvStores = (parse(readFileSync(join(DATA, 'stores.csv')), { columns: true, trim: true }) as Record<string, string>[])
      .map((r) => ({ store_id: r.store_id, capacity: Number(r.stock_capacity_units) }));
    const added = this.stores.extraStores().map((s) => ({ store_id: s.store_id, capacity: s.stock_capacity_units }));
    const locations: CheckContext['locations'] = new Map([['WH-KOL', { capacity: null, stock_now: 0 }]]);
    for (const s of [...csvStores, ...added]) locations.set(s.store_id, { capacity: s.capacity, stock_now: stockNow.get(s.store_id) ?? 0 });
    return { locations, items: new Map([...this.catalog, ...this.added]), today: new Date().toISOString().slice(0, 10) };
  }
}

async function readXlsx(buf: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const out: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = [];
    for (let i = 1; i <= COLUMNS.length + 1; i++) {
      const v = row.getCell(i).value;
      cells.push(v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? '' : typeof v === 'object' && 'text' in v ? String(v.text) : String(v));
    }
    out.push(cells);
  });
  return out;
}
