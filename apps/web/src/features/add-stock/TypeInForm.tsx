import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { dateLong, pieces, storeLabel } from '../../lib/format';
import { checkRow, commit, type FakeCtx } from './api';
import { capacityText, oldDateText } from './notes';
import { beforeCount, sentence, type StockCheckResult, type StockRowInput } from './types';

type Field = 'location_id' | 'sku_id' | 'qty' | 'received_on';
type Errors = Partial<Record<Field | 'form', string>>;
type Checked = { input: StockRowInput; result: StockCheckResult; fake: boolean };

const inputCls = 'h-[52px] w-full min-w-0 rounded-xl border-[1.5px] border-[#D9C49C] bg-[#FFFDF8] px-4 text-base text-ink';

/** Errors on columns the form does not show (name, category, price, size) land under the product code. */
function fieldOf(column: string): Field {
  return column === 'location_id' || column === 'qty' || column === 'received_on' ? column : 'sku_id';
}

/** Step 1 "Check" runs the same checks as the file on one row; step 2 "Add this item" saves it. */
export function TypeInForm({ ctx, nextRun }: { ctx: FakeCtx; nextRun: string }) {
  const locations = ['WH-KOL', ...[...ctx.stores].sort((a, b) => a.city.localeCompare(b.city)).map((s) => s.store_id)];
  const [loc, setLoc] = useState('WH-KOL');
  const [sku, setSku] = useState('');
  const [qty, setQty] = useState('');
  const [date, setDate] = useState(ctx.today);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [done, setDone] = useState<string | null>(null);

  /** Any edit after a check makes the user check again. */
  const edit = (set: (v: string) => void) => (v: string) => { set(v); setChecked(null); setDone(null); setErrors({}); };

  async function check(e: FormEvent) {
    e.preventDefault();
    setDone(null);
    setChecked(null);
    const local: Errors = {};
    if (!sku.trim()) local.sku_id = 'Type the product code.';
    if (!qty.trim()) local.qty = 'Type how many pieces arrived.';
    if (!date) local.received_on = 'Pick the date the pieces arrived.';
    setErrors(local);
    if (Object.keys(local).length) return;

    setBusy(true);
    const input = { location_id: loc, sku_id: sku.trim().toUpperCase(), qty: Number(qty), received_on: date };
    const out = await checkRow(ctx, input);
    setBusy(false);
    if (out.kind !== 'checked') {
      setErrors({ form: out.kind === 'unavailable' ? 'Adding stock is not available right now.' : out.message });
      return;
    }
    const r = out.result;
    if (r.errors.length || r.ok_rows === 0) {
      const next: Errors = {};
      for (const er of r.errors) next[fieldOf(er.column)] ??= sentence(er.message, er.fix);
      if (!r.errors.length) next.form = 'This item could not be checked.';
      setErrors(next);
      return;
    }
    setChecked({ input, result: r, fake: out.fake });
  }

  async function add() {
    if (!checked) return;
    setBusy(true);
    const c = await commit(checked.result.check_id, checked.fake, checked.result);
    setBusy(false);
    if (c.kind === 'added') {
      setDone(`Added ${pieces(c.pieces)} of ${checked.input.sku_id} to ${storeLabel(checked.input.location_id, ctx.stores)}. Counted in the next daily run, ${nextRun}.`);
      setChecked(null);
      setSku('');
      setQty('');
    } else {
      setErrors({
        form: c.kind === 'unavailable' ? 'Adding stock is not available right now.'
          : c.kind === 'refused' ? 'This exact item was already added. Nothing was added twice.' : c.message,
      });
    }
  }

  const err = (f: Field) =>
    errors[f] ? (
      <p id={`${f}-err`} className="m-0 text-sm font-semibold text-danger">
        {errors[f]}
        {f === 'location_id' && <> <Link to="/add-store" className="text-cta underline">Add this store</Link></>}
      </p>
    ) : null;

  // Only a name the check response carries; the response has none today, so it stays out rather than guessed.
  const name = (checked?.result as { style_name?: string } | undefined)?.style_name;
  const isNew = checked?.result.new_skus.includes(checked.input.sku_id);
  const full = checked?.result.by_location.filter((l) => l.over_capacity) ?? [];
  const otherWarnings = checked?.result.warnings.filter((w) => w.row > 0) ?? [];

  return (
    <section className="flex flex-col gap-5 md:gap-6">
      <div>
        <h2 className="m-0 font-heading text-2xl font-normal text-ink md:text-3xl">Only one or two items? Type them in.</h2>
        <p className="mt-1 text-muted">Same check as the file, one line at a time. Check first, then add.</p>
      </div>
      <Card>
        <form onSubmit={check} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(230px,1.4fr)_minmax(180px,1.2fr)_minmax(140px,0.9fr)_minmax(170px,1fr)]">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="as-loc" className="text-sm font-semibold">Where it arrived</label>
            <select id="as-loc" value={loc} onChange={(e) => edit(setLoc)(e.target.value)} className={`${inputCls} pr-8`} aria-describedby={errors.location_id ? 'location_id-err' : undefined}>
              {locations.map((id) => <option key={id} value={id}>{storeLabel(id, ctx.stores)}</option>)}
            </select>
            {err('location_id')}
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="as-sku" className="text-sm font-semibold">Product code</label>
            <input id="as-sku" value={sku} onChange={(e) => edit(setSku)(e.target.value)} placeholder="Style-number-size" autoComplete="off" className={inputCls} aria-invalid={!!errors.sku_id} aria-describedby={errors.sku_id ? 'sku_id-err' : undefined} />
            {err('sku_id')}
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="as-qty" className="text-sm font-semibold">Pieces</label>
            <input id="as-qty" type="number" min={1} step={1} inputMode="numeric" value={qty} onChange={(e) => edit(setQty)(e.target.value)} className={inputCls} aria-invalid={!!errors.qty} aria-describedby={errors.qty ? 'qty-err' : undefined} />
            {err('qty')}
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="as-date" className="text-sm font-semibold">Date received</label>
            <input id="as-date" type="date" max={ctx.today} value={date} onChange={(e) => edit(setDate)(e.target.value)} className={inputCls} aria-invalid={!!errors.received_on} aria-describedby={errors.received_on ? 'received_on-err' : undefined} />
            {err('received_on')}
          </div>
          {!checked && !errors.received_on && beforeCount(date, ctx.asOf) && (
            <p className="m-0 text-sm font-semibold text-warn sm:col-span-2 xl:col-span-4" role="status">{oldDateText(ctx.asOf)}</p>
          )}
          <div className="sm:col-span-2 xl:col-span-4">
            {!checked && (
              <Button type="submit" variant="outline" disabled={busy} className="max-md:w-full">
                {busy ? 'Checking…' : 'Check this item'}
              </Button>
            )}
          </div>
        </form>

        {checked && (
          <div className="mt-5 flex flex-col gap-3 rounded-xl bg-page p-4 md:p-5" role="status">
            <div className="font-semibold text-ok">Checked. Nothing is saved yet.</div>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[15px]">
              <dt className="text-muted">Where</dt><dd className="m-0 font-semibold">{storeLabel(checked.input.location_id, ctx.stores)}</dd>
              <dt className="text-muted">Product</dt><dd className="m-0 font-semibold">{checked.input.sku_id}{name ? ` · ${name}` : ''}</dd>
              <dt className="text-muted">Pieces</dt><dd className="m-0 font-semibold">{pieces(checked.result.pieces)}</dd>
              <dt className="text-muted">Received</dt><dd className="m-0 font-semibold">{dateLong(checked.input.received_on)}</dd>
            </dl>
            {isNew && <div className="text-[15px]">This product code is new, so a new product will be created.</div>}
            {full.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {full.map((l) => <Chip key={l.location_id} tone="warn" className="whitespace-normal">{capacityText(l.location_id, checked.result.warnings, ctx.stores)}</Chip>)}
              </div>
            )}
            {otherWarnings.map((w, i) => <div key={i} className="text-[15px] text-[#6B4100]">{sentence(w.message, w.fix)}</div>)}
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={add} disabled={busy} className="max-md:w-full">{busy ? 'Adding…' : 'Add this item'}</Button>
              <Button variant="ghost" onClick={() => setChecked(null)} disabled={busy} className="max-md:w-full">Change it</Button>
            </div>
            <div className="text-sm text-muted">Goes into the next daily run, {nextRun}.</div>
          </div>
        )}
        {errors.form && <p className="mt-4 mb-0 font-semibold text-danger" role="alert">{errors.form}</p>}
        {done && <p className="mt-4 mb-0 rounded-xl bg-ok-bg px-4 py-3 font-semibold text-ok" role="status">{done}</p>}
      </Card>
    </section>
  );
}
