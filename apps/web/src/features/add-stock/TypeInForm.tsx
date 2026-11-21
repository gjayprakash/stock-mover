import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { pieces, storeLabel } from '../../lib/format';
import { checkRow, commit, type FakeCtx } from './api';

type Field = 'location_id' | 'sku_id' | 'qty' | 'received_on';
type Errors = Partial<Record<Field | 'form', string>>;

const inputCls = 'h-[52px] w-full rounded-xl border-[1.5px] border-[#D9C49C] bg-[#FFFDF8] px-4 text-base text-ink';

/** Errors on columns the form does not show (name, category, price, size) land under the product code. */
function fieldOf(column: string): Field {
  return column === 'location_id' || column === 'qty' || column === 'received_on' ? column : 'sku_id';
}

export function TypeInForm({ ctx, nextRun }: { ctx: FakeCtx; nextRun: string }) {
  const locations = ['WH-KOL', ...[...ctx.stores].sort((a, b) => a.city.localeCompare(b.city)).map((s) => s.store_id)];
  const [loc, setLoc] = useState('WH-KOL');
  const [sku, setSku] = useState('');
  const [qty, setQty] = useState('');
  const [date, setDate] = useState(ctx.today);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setDone(null);
    const local: Errors = {};
    if (!sku.trim()) local.sku_id = 'Type the product code.';
    if (!qty.trim()) local.qty = 'Type how many pieces arrived.';
    if (!date) local.received_on = 'Pick the date the pieces arrived.';
    setErrors(local);
    if (Object.keys(local).length) return;

    setBusy(true);
    const input = { location_id: loc, sku_id: sku.trim().toUpperCase(), qty: Number(qty), received_on: date };
    const out = await checkRow(ctx, input);
    if (out.kind !== 'checked') {
      setErrors({ form: out.kind === 'unavailable' ? 'Adding stock is not available right now.' : out.kind === 'error' || out.kind === 'refused' ? out.message : '' });
      setBusy(false);
      return;
    }
    const r = out.result;
    if (r.errors.length || r.ok_rows === 0) {
      const next: Errors = {};
      for (const er of r.errors) next[fieldOf(er.column)] ??= `${er.message} ${er.fix}`;
      setErrors(next);
      setBusy(false);
      return;
    }
    const c = await commit(r.check_id, out.fake, r);
    setBusy(false);
    if (c.kind === 'added') {
      setDone(`Added ${pieces(c.pieces)} of ${input.sku_id} to ${storeLabel(loc, ctx.stores)}. Counted in the next daily run, ${nextRun}.`);
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

  return (
    <section className="flex flex-col gap-5 md:gap-6">
      <div>
        <h2 className="m-0 font-heading text-2xl font-normal text-ink md:text-3xl">Only one or two items? Type them in.</h2>
        <p className="mt-1 text-muted">Same check as the file, one line at a time.</p>
      </div>
      <Card>
        <form onSubmit={submit} noValidate className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-1.5">
            <label htmlFor="as-loc" className="text-sm font-semibold">Where it arrived</label>
            <select id="as-loc" value={loc} onChange={(e) => setLoc(e.target.value)} className={inputCls} aria-describedby={errors.location_id ? 'location_id-err' : undefined}>
              {locations.map((id) => <option key={id} value={id}>{storeLabel(id, ctx.stores)}</option>)}
            </select>
            {err('location_id')}
          </div>
          <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-1.5">
            <label htmlFor="as-sku" className="text-sm font-semibold">Product code</label>
            <input id="as-sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Style-number-size" autoComplete="off" className={inputCls} aria-invalid={!!errors.sku_id} aria-describedby={errors.sku_id ? 'sku_id-err' : undefined} />
            {err('sku_id')}
          </div>
          <div className="flex min-w-0 flex-[1_1_120px] flex-col gap-1.5">
            <label htmlFor="as-qty" className="text-sm font-semibold">Pieces</label>
            <input id="as-qty" type="number" min={1} step={1} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} aria-invalid={!!errors.qty} aria-describedby={errors.qty ? 'qty-err' : undefined} />
            {err('qty')}
          </div>
          <div className="flex min-w-0 flex-[1_1_170px] flex-col gap-1.5">
            <label htmlFor="as-date" className="text-sm font-semibold">Date received</label>
            <input id="as-date" type="date" max={ctx.today} value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} aria-invalid={!!errors.received_on} aria-describedby={errors.received_on ? 'received_on-err' : undefined} />
            {err('received_on')}
          </div>
          <div className="flex flex-col gap-1.5 max-md:w-full">
            <span className="hidden text-sm md:block" aria-hidden="true">&nbsp;</span>
            <button type="submit" disabled={busy} className="h-[52px] rounded-xl bg-brown px-7 font-semibold text-page hover:bg-[#3D1600] disabled:opacity-60 max-md:w-full">
              {busy ? 'Checking…' : 'Add this item'}
            </button>
          </div>
        </form>
        {errors.form && <p className="mt-4 mb-0 font-semibold text-danger" role="alert">{errors.form}</p>}
        {done && <p className="mt-4 mb-0 rounded-xl bg-ok-bg px-4 py-3 font-semibold text-ok" role="status">{done}</p>}
      </Card>
    </section>
  );
}
