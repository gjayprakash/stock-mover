import { useEffect, useRef, type ReactNode } from 'react';
import type { Move, Side, StoreSummary } from '@sm/contract';
import { Button, Chip, ConfidenceDot, KIND_LABEL, dateShort, inr, storeLabel } from './deps';
import type { ApprovalStatus } from './filters';
import { AlternativesList, distanceSentence, hasDistance } from './Distance';
import { WeeklySales } from './WeeklySales';

const WH = 'WH-KOL';
const nf = new Intl.NumberFormat('en-IN');
const pcs = (n: number) => `${nf.format(n)} ${n === 1 ? 'piece' : 'pieces'}`;

const CHECKS: [keyof Move['checks'], string][] = [
  ['min_display', 'Both stores keep their minimum display'],
  ['capacity', 'The receiving store does not go over its space'],
  ['flagship', "A flagship's top-20 styles are not given away"],
  ['in_transit', 'Stock already on its way is counted, never sent twice'],
  ['donor_cover_30', 'A sending store keeps at least 30 days of stock'],
];

/** Sales rate in plain words: "about 2.7 a week", "less than 1 a month". */
function rate(v: number): string {
  const week = v * 7;
  if (week >= 10) return `about ${Math.round(week)} a week`;
  if (week >= 1) return `about ${week.toFixed(1).replace(/\.0$/, '')} a week`;
  const month = v * 30;
  return month >= 1 ? `about ${month.toFixed(1).replace(/\.0$/, '')} a month` : 'less than 1 a month';
}
const lasts = (d: number | null) => (d == null ? null : Math.round(d));
/** "about 45 days", or "more than a year" for very slow stock. */
const howLong = (d: number) => (d > 365 ? 'more than a year' : `about ${d} ${d === 1 ? 'day' : 'days'}`);

/** One end of the move: the place that sends or receives, now vs after this move, in words. */
function PlaceCard({ role, id, name, before, after, qty, receives, estimated }: {
  role: string; id: string; name: string; before: Side; after: Side; qty: number; receives: boolean;
  /** The sales rate here is estimated from similar stores (velocity_basis peer / blended). */
  estimated: 'peer' | 'blended' | null;
}) {
  const wh = id === WH;
  const cell = 'py-1.5 text-right tabular-nums';
  const b = lasts(before.cover_days), a = lasts(after.cover_days);
  const incoming = receives && after.in_transit - before.in_transit === qty;
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-line bg-white p-4">
      <div>
        <div className="text-[13px] font-bold tracking-wide text-muted uppercase">{role}</div>
        <div className="font-semibold">{name}</div>
      </div>
      <table className="w-full border-collapse text-[15px]">
        <thead>
          <tr className="text-[13px] text-muted">
            <th className="py-1 text-left font-semibold"><span className="sr-only">Stock</span></th>
            <th className="py-1 text-right font-semibold">Now</th>
            <th className="py-1 pl-3 text-right font-semibold">After this move</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-line">
            <th scope="row" className="py-1.5 text-left font-normal">On the shelf</th>
            <td className={cell}>{nf.format(before.on_hand)}</td>
            <td className={`${cell} pl-3 font-semibold`}>{nf.format(after.on_hand)}</td>
          </tr>
          <tr className="border-t border-line">
            <th scope="row" className="py-1.5 text-left font-normal">On the way</th>
            <td className={cell}>{nf.format(before.in_transit)}</td>
            <td className={`${cell} pl-3 font-semibold`}>{nf.format(after.in_transit)}</td>
          </tr>
        </tbody>
      </table>
      {incoming && <p className="m-0 text-[13px] text-muted">"On the way" after this move includes {qty === 1 ? 'this piece' : `these ${pcs(qty)}`}.</p>}
      {wh ? (
        <p className="m-0 text-[15px]">This is the warehouse, so only its stock is shown.</p>
      ) : (
        <p className="m-0 text-[15px] leading-relaxed">
          {before.velocity > 0 ? (
            <>
              Sells {rate(before.velocity)} here
              {estimated === 'peer' ? ' (estimated from similar stores)' : estimated === 'blended' ? " (from this store's and similar stores' sales)" : ''}.{' '}
            </>
          ) : null}
          {b === 0 && a != null
            ? `It has none left now; after this move the stock lasts ${howLong(a)}.`
            : b == null && a == null
            ? 'No sales here, so this stock does not run out.'
            : b == null
              ? `After this move the stock lasts ${howLong(a!)}.`
              : a == null
                ? `Stock lasts ${howLong(b)} now; after this move none is left to run down.`
                : howLong(b) === howLong(a)
                  ? `Stock lasts ${howLong(b)}, before and after.`
                  : `Stock lasts ${howLong(b)} now, ${howLong(a)} after this move.`}
        </p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="m-0 font-heading text-lg font-normal text-brown">{title}</h3>
      {children}
    </section>
  );
}

export type MovePanelProps = {
  move: Move;
  stores: StoreSummary[];
  position: { index: number; total: number } | null;
  status: ApprovalStatus;
  onApprove: () => void;
  onSkip: () => void;
  onUndo: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
  /** Compact bulk-action bar, shown in the footer while the panel covers the page (under 1024 px). */
  bulk?: ReactNode;
};

/** Detail panel fixed to the right edge (full-width sheet under 1024 px). The table behind it never moves. */
export function MovePanel(p: MovePanelProps) {
  const m = p.move;
  const name = (id: string) => (id === WH ? 'the warehouse (WH-KOL)' : storeLabel(id, p.stores));
  const title = (id: string) => (id === WH ? 'Warehouse · WH-KOL' : storeLabel(id, p.stores));
  const heading = useRef<HTMLHeadingElement>(null);

  // Focus the heading whenever a move is shown, without scrolling anything.
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [m.id]);

  const sentence =
    m.type === 'PULL_BACK'
      ? `Send ${pcs(m.qty)} from ${name(m.from)} back to the warehouse.`
      : `Send ${pcs(m.qty)} from ${name(m.from)} to ${name(m.to)}.`;
  const passed = Object.values(m.checks).filter(Boolean).length;
  const chartStore = m.type === 'PULL_BACK' ? m.from : m.to;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="move-panel-title"
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' && p.onNext) { e.preventDefault(); p.onNext(); }
        if (e.key === 'ArrowUp' && p.onPrev) { e.preventDefault(); p.onPrev(); }
      }}
      className="fixed inset-x-0 top-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col bg-page shadow-[-12px_0_32px_rgba(81,29,0,0.14)] motion-safe:animate-[sm-panel-in_180ms_ease-out] md:bottom-0 lg:left-auto lg:w-[480px] lg:border-l lg:border-line"
    >
      <style>{'@keyframes sm-panel-in{from{transform:translateX(24px)}to{transform:none}}'}</style>

      <header className="flex items-start gap-3 border-b border-line bg-white px-5 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="text-[13px] font-bold text-muted">
            {KIND_LABEL[m.type]}{m.trigger === 'AGEING' ? ' · old stock' : ''} · {m.id}
          </div>
          <h2 id="move-panel-title" ref={heading} tabIndex={-1} className="m-0 font-heading text-[22px] leading-tight font-normal text-ink outline-none">
            {m.style_name}, size {m.size}
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{m.sku_id}</span>
            {m.needs_signoff && <Chip tone="orange">Needs sign-off</Chip>}
            {p.status === 'approved' && <Chip tone="ok">Approved</Chip>}
            {p.status === 'skipped' && <Chip>Skipped</Chip>}
          </div>
        </div>
        <button
          type="button"
          onClick={p.onClose}
          aria-label="Close move details"
          className="-mt-1 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl leading-none text-brown hover:bg-tint"
        >
          ×
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto overscroll-contain px-5 py-5">
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[17px] leading-relaxed text-ink">
            {sentence} Arrives {dateShort(m.arrives_on)}, {m.lead_time_days} {m.lead_time_days === 1 ? 'day' : 'days'} from now.
          </p>
          <p className="m-0 text-[15px] text-muted">
            Worth {inr(m.value_inr)} at full price ({m.qty} × {inr(m.mrp)}).
            {m.needs_signoff && <span className="font-semibold text-[#8A2C07]"> Needs your sign-off because of its value.</span>}
          </p>
        </div>

        <Section title="Why">
          <div className="flex flex-col gap-2 rounded-xl border-l-4 border-cta bg-white px-4 py-3">
            <p className="m-0 text-[15px] leading-relaxed">{m.reason}</p>
            <ConfidenceDot basis={m.velocity_basis} showLabel />
            {m.stock_age_days != null && (
              <p className="m-0 text-sm text-muted">The oldest of these pieces has been at {m.from} for {m.stock_age_days} days.</p>
            )}
          </div>
        </Section>

        <Section title="What changes">
          <div className="grid gap-3">
            <PlaceCard role="Sends" id={m.from} name={title(m.from)} before={m.from_before} after={m.from_after} qty={m.qty} receives={false}
              estimated={m.type === 'PULL_BACK' && m.velocity_basis !== 'own' ? m.velocity_basis : null} />
            <PlaceCard role="Receives" id={m.to} name={title(m.to)} before={m.to_before} after={m.to_after} qty={m.qty} receives
              estimated={m.type !== 'PULL_BACK' && m.velocity_basis !== 'own' ? m.velocity_basis : null} />
          </div>
        </Section>

        {hasDistance(m) && (
          <Section title="Why this store">
            <p className="m-0 text-[15px]">{distanceSentence(m)}</p>
            <AlternativesList move={m} />
          </Section>
        )}

        <Section title="Rules checked">
          <p className={`m-0 text-[15px] font-semibold ${passed === CHECKS.length ? 'text-ok' : 'text-danger'}`}>
            {passed === CHECKS.length ? `All ${CHECKS.length} rules pass` : `${passed} of ${CHECKS.length} rules pass`}
          </p>
          <ul className="m-0 flex list-none flex-col gap-1.5 rounded-xl bg-ok-bg p-4 text-[15px] text-[#123D2E]">
            {CHECKS.map(([k, label]) => (
              <li key={k} className="flex items-start gap-2">
                <span aria-hidden className={m.checks[k] ? 'text-ok' : 'text-danger'}>{m.checks[k] ? '✓' : '✗'}</span>
                <span>{label}<span className="sr-only">{m.checks[k] ? ': passes' : ': fails'}</span></span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={`Sold each week at ${title(chartStore)}, last 12 weeks`}>
          <WeeklySales move={m} storeName={title(chartStore)} />
        </Section>
      </div>

      <footer className="flex flex-col gap-3 border-t border-line bg-white px-5 py-3">
        {p.bulk}
        <div className="flex flex-wrap items-center gap-2">
          {p.status ? (
            <Button variant="outline" onClick={p.onUndo}>Undo {p.status === 'approved' ? 'approval' : 'skip'}</Button>
          ) : (
            <>
              <Button onClick={p.onApprove}>{m.needs_signoff ? 'Sign off and approve' : 'Approve'}</Button>
              <Button variant="outline" onClick={p.onSkip}>Skip</Button>
            </>
          )}
          <span className="ml-auto flex items-center gap-1">
            {p.position && <span className="mr-1 text-sm whitespace-nowrap text-muted">{p.position.index + 1} of {nf.format(p.position.total)}</span>}
            <Button variant="ghost" size="sm" disabled={!p.onPrev} onClick={() => p.onPrev?.()} aria-label="Previous move">↑ Prev</Button>
            <Button variant="ghost" size="sm" disabled={!p.onNext} onClick={() => p.onNext?.()} aria-label="Next move">↓ Next</Button>
          </span>
        </div>
      </footer>
    </aside>
  );
}
