import { useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import type { StoreSummary } from '@sm/contract';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { Section } from '../../components/Section';
import { num, pieces, storeLabel } from '../../lib/format';
import { checkFile, commit, downloadErrors, type FakeCtx } from './api';
import { MAX_ROWS, STOCK_COLUMNS, type StockCheckResult } from './types';

type State =
  | { step: 'empty' }
  | { step: 'checking'; fileName: string }
  | { step: 'checked'; fileName: string; result: StockCheckResult; fake: boolean; adding?: boolean; addError?: string }
  | { step: 'added'; result: StockCheckResult; fake: boolean; rows: number; pieces: number }
  | { step: 'refused'; fileName: string; message: string }
  | { step: 'error'; message: string }
  | { step: 'unavailable' };

const linkCls = 'inline-flex min-h-11 items-center font-semibold text-cta underline-offset-2 hover:text-brown hover:underline';

function plural(n: number, one: string, many: string) {
  return `${num(n)} ${n === 1 ? one : many}`;
}

export function UploadAndCheck({ ctx, nextRun }: { ctx: FakeCtx; nextRun: string }) {
  const [state, setState] = useState<State>({ step: 'empty' });
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const stores: StoreSummary[] = ctx.stores;

  async function run(file: File) {
    setState({ step: 'checking', fileName: file.name });
    const out = await checkFile(ctx, file);
    if (out.kind === 'checked') setState({ step: 'checked', fileName: file.name, result: out.result, fake: out.fake });
    else if (out.kind === 'refused') setState({ step: 'refused', fileName: file.name, message: out.message });
    else if (out.kind === 'unavailable') setState({ step: 'unavailable' });
    else setState({ step: 'error', message: out.message });
  }

  async function add() {
    if (state.step !== 'checked') return;
    setState({ ...state, adding: true, addError: undefined });
    const out = await commit(state.result.check_id, state.fake, state.result);
    if (out.kind === 'added') setState({ step: 'added', result: state.result, fake: state.fake, rows: out.rows, pieces: out.pieces });
    else if (out.kind === 'unavailable') setState({ step: 'unavailable' });
    else setState({ ...state, adding: false, addError: out.message });
  }

  function reset() {
    setState({ step: 'empty' });
    if (input.current) input.current.value = '';
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) run(f);
  }

  const busy = state.step === 'checking';

  return (
    <>
      <Section n={2} title="Upload your file" explainer="Nothing is added yet. We check every row first and show you the result.">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-5 py-10 text-center md:px-8 md:py-11 ${dragging ? 'border-cta bg-cta-bg' : 'border-[#D9C49C] bg-white'}`}
        >
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-cta" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
          <div className="text-xl font-bold">Drop your file here</div>
          <div className="text-muted">CSV or Excel (.xlsx), up to {num(MAX_ROWS)} rows</div>
          <input
            ref={input}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            id="stock-file"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) run(f); }}
          />
          <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>Choose a file</Button>
        </div>
      </Section>

      <Section n={3} title="Check, then add" explainer="Good rows can go in now. Rows with a mistake wait until you fix them.">
        {state.step === 'empty' && (
          <Card className="text-[17px] text-muted">No file yet. After you upload, the result of the check shows here.</Card>
        )}

        {state.step === 'checking' && (
          <Card className="flex items-center gap-4 text-[17px]" role="status">
            <span className="h-7 w-7 shrink-0 animate-spin rounded-full border-[3px] border-tint border-t-cta" aria-hidden="true" />
            <span>Checking <span className="font-bold break-all">{state.fileName}</span>. Nothing is saved yet.</span>
          </Card>
        )}

        {state.step === 'refused' && (
          <Card className="flex flex-col gap-3 border-l-4 border-danger">
            <h3 className="m-0 font-heading text-2xl font-normal text-danger">We could not read this file</h3>
            <p className="m-0 text-[17px] leading-normal">
              <span className="font-bold break-all">{state.fileName}</span>: {state.message}
            </p>
            <p className="m-0 text-muted">
              Nothing was added.
              {/column/i.test(state.message) && ` The file needs these ${STOCK_COLUMNS.length} columns in this order: ${STOCK_COLUMNS.join(', ')}.`}
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <a href="#sample-file" className={linkCls}>Go to the sample file</a>
              <Button variant="outline" onClick={reset}>Upload a corrected file</Button>
            </div>
          </Card>
        )}

        {state.step === 'error' && (
          <Card className="flex flex-col gap-3 border-l-4 border-danger">
            <p className="m-0 text-[17px]">{state.message} Nothing was added.</p>
            <div><Button variant="outline" onClick={reset}>Try again</Button></div>
          </Card>
        )}

        {state.step === 'unavailable' && (
          <Card className="flex flex-col gap-3">
            <h3 className="m-0 font-heading text-2xl font-normal text-brown">Adding stock is not available right now</h3>
            <p className="m-0 text-muted">Nothing was added. Please try again later.</p>
            <div><Button variant="outline" onClick={reset}>Try again</Button></div>
          </Card>
        )}

        {state.step === 'checked' && <Checked state={state} stores={stores} nextRun={nextRun} onAdd={add} onReset={reset} />}

        {state.step === 'added' && (
          <div className="flex flex-col gap-2.5 rounded-2xl bg-ok-bg p-5 text-[#123D2E] md:p-8" role="status">
            <div className="font-heading text-2xl md:text-[28px]">Added. {pieces(state.pieces)} in {plural(state.rows, 'row', 'rows')}.</div>
            <div className="text-[17px] leading-normal">
              They will be counted in the next daily run, {nextRun}. Today's list does not change.
              {state.result.errors.length > 0 && ` The ${plural(state.result.errors.length, 'row', 'rows')} with a mistake ${state.result.errors.length === 1 ? 'was' : 'were'} not added.`}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {state.result.errors.length > 0 && (
                <button type="button" onClick={() => downloadErrors(state.result.check_id, state.fake)} className="min-h-11 cursor-pointer border-0 bg-transparent p-0 font-semibold text-[#123D2E] underline">
                  Download the {plural(state.result.errors.length, 'row', 'rows')} to fix
                </button>
              )}
              <button type="button" onClick={reset} className="min-h-11 cursor-pointer border-0 bg-transparent p-0 font-semibold text-[#123D2E] underline">
                Add another file
              </button>
            </div>
          </div>
        )}
      </Section>
    </>
  );
}

function Checked({
  state, stores, nextRun, onAdd, onReset,
}: {
  state: Extract<State, { step: 'checked' }>;
  stores: StoreSummary[];
  nextRun: string;
  onAdd: () => void;
  onReset: () => void;
}) {
  const r = state.result;
  const bad = r.errors.length;
  const full = r.by_location.filter((l) => l.over_capacity);
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-col gap-5 p-5 md:px-8 md:py-7">
        <div className="text-muted">
          We read <span className="font-bold break-all text-ink">{state.fileName}</span>. The columns are in the right order.
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
          <Tile n={r.rows_total} label={r.rows_total === 1 ? 'row in the file' : 'rows in the file'} cls="bg-page" />
          <Tile n={r.ok_rows} label={`${r.ok_rows === 1 ? 'row' : 'rows'} ready to add · ${pieces(r.pieces)}`} cls="bg-ok-bg" num="text-[#1D5B45]" />
          <Tile n={bad} label={bad === 1 ? 'row needs fixing' : 'rows need fixing'} cls="bg-cta-bg" num="text-[#8A2C07]" />
        </div>
        {r.by_location.length > 0 && (
          <div className="flex flex-col gap-2 rounded-xl bg-page px-4 py-3 leading-normal">
            <div>
              Where the {pieces(r.pieces)} go:{' '}
              {r.by_location.map((l, i) => (
                <span key={l.location_id}>
                  {i > 0 && (i === r.by_location.length - 1 ? ' and ' : ', ')}
                  <span className="font-semibold">{num(l.pieces)}</span> to {storeLabel(l.location_id, stores)}
                </span>
              ))}
              .{full.length === 0 && r.by_location.some((l) => l.location_id !== 'WH-KOL') && ' Every store has room.'}
            </div>
            {full.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {full.map((l) => (
                  <Chip key={l.location_id} tone="warn">{storeLabel(l.location_id, stores)} goes over its space</Chip>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Row 0 warnings are the over-capacity ones, already shown as chips above. */}
        {r.warnings.some((w) => w.row > 0) && (
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[15px] text-[#6B4100]">
            {r.warnings.filter((w) => w.row > 0).map((w, i) => (
              <li key={i}><span className="font-semibold">Row {w.row}:</span> {w.message}. {w.fix}</li>
            ))}
          </ul>
        )}
      </div>
      {r.errors.map((e, i) => (
        <div key={`${e.row}-${i}`} className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-line px-5 py-4 md:px-8 md:py-5">
          <div className="w-[90px] shrink-0 text-[15px] font-bold text-[#8A2C07]">Row {e.row}</div>
          <div className="min-w-0 flex-1 basis-64">
            <div className="font-semibold">{e.message}</div>
            <div className="mt-0.5 text-[15px] text-muted">{e.fix}</div>
          </div>
          {e.column === 'location_id' && (
            <Link to="/add-store" className={linkCls}>Add this store</Link>
          )}
        </div>
      ))}
      <div className="flex flex-col gap-3 border-t border-line px-5 py-5 md:px-8 md:py-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {r.ok_rows > 0 && (
            <Button onClick={onAdd} disabled={state.adding} className="max-md:w-full">
              {state.adding ? 'Adding…' : `Add the ${plural(r.ok_rows, 'good row', 'good rows')}`}
            </Button>
          )}
          <Button variant="outline" onClick={onReset} disabled={state.adding} className="max-md:w-full">Upload a corrected file</Button>
          {bad > 0 && (
            <button type="button" onClick={() => downloadErrors(r.check_id, state.fake)} className={`${linkCls} cursor-pointer border-0 bg-transparent p-0`}>
              Download the {plural(bad, 'row', 'rows')} to fix
            </button>
          )}
        </div>
        {r.ok_rows > 0 ? (
          <div className="text-sm text-muted">Goes into the next daily run, {nextRun}. Today's list stays as it is.</div>
        ) : r.rows_total === 0 ? (
          <div className="text-sm text-muted">The file has no rows to add. The example rows from the sample are skipped, so add your own rows below the header.</div>
        ) : (
          <div className="text-sm text-muted">No row is ready to add. Fix the rows above and upload the file again.</div>
        )}
        {state.addError && <div className="font-semibold text-danger" role="alert">{state.addError}</div>}
      </div>
    </Card>
  );
}

function Tile({ n, label, cls, num: numCls = '' }: { n: number; label: string; cls: string; num?: string }) {
  return (
    <div className={`rounded-xl p-5 ${cls}`}>
      <div className={`font-heading text-4xl leading-none ${numCls}`}>{num(n)}</div>
      <div className="mt-1.5 text-[15px] text-muted">{label}</div>
    </div>
  );
}
