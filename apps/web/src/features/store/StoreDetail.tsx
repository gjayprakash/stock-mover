import { Link, useNavigate } from 'react-router-dom';
import type { MovesFile, StoreSummary } from '@sm/contract';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { EmptyState } from '../../components/EmptyState';
import { Section } from '../../components/Section';
import { StatusChip } from '../../components/StatusChip';
import { useApprovals } from '../../data/approvals';
import { dateLong, dateShort, days, inr, inrShort, num, pieces, storeLabel } from '../../lib/format';
import { CategoryBars } from './CategoryBars';
import { byRisk, outgoingText, pct, summaryLine } from './storeText';

const SHOW_INCOMING = 6;

export function StoreDetail({ file, store }: { file: MovesFile; store: StoreSummary }) {
  const navigate = useNavigate();
  const approvals = useApprovals();
  const id = store.store_id;

  const incoming = file.moves.filter((m) => m.to === id).sort((a, b) => b.value_inr - a.value_inr);
  const outgoing = file.moves.filter((m) => m.from === id);
  const all = [...incoming, ...outgoing];
  const signoff = all.filter((m) => m.needs_signoff);
  const approvable = all.filter((m) => !m.needs_signoff);
  const open = approvable.filter((m) => approvals.statusOf(m.id) !== 'approved');
  // stock_now counts pieces on the way; category rows count only pieces on the shelf.
  const onTheWay = store.stock_now - store.categories.reduce((n, c) => n + c.now, 0);
  const belowMin = store.categories.filter((c) => c.now < c.min_display).length;

  const fromWh = incoming.filter((m) => m.from === 'WH-KOL').reduce((n, m) => n + m.qty, 0);
  const fromStores = incoming.reduce((n, m) => n + m.qty, 0) - fromWh;
  const whLead = file.moves.find((m) => (m.from === 'WH-KOL' && m.to === id) || (m.to === 'WH-KOL' && m.from === id))?.lead_time_days;

  const dataProblem = file.problems.find((p) => p.kind === 'DATA_FLAG' && p.subject.store_id === id);
  const dataFlag = file.flags.find((f) => f.kind === 'DATA_COUNT_MISMATCH' && f.store_id === id);
  const newStore = file.problems.find((p) => p.kind === 'NEW_STORE' && p.subject.store_id === id);
  const stores = [...file.stores].sort(byRisk);
  const valueApprovable = approvable.reduce((n, m) => n + m.value_inr, 0);

  return (
    <div className="flex flex-col gap-10 md:gap-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Link to="/" className="flex min-h-11 items-center gap-2 font-semibold text-[#A8340A] no-underline hover:text-brown">
          <span aria-hidden="true">‹</span> All {file.stores.length} stores
        </Link>
        <label className="flex w-full flex-col gap-1 text-[13px] text-muted sm:w-auto">
          Jump to a store
          <select
            value={id}
            onChange={(e) => navigate(`/stores/${e.target.value}`)}
            className="h-12 min-w-60 rounded-xl border-[1.5px] border-[#D9C49C] bg-white px-3 text-[15px] text-ink"
          >
            {stores.map((s) => (
              <option key={s.store_id} value={s.store_id}>
                {s.city} · {s.store_id}{s.status !== 'NORMAL' ? ` (${s.status === 'TOO_FULL' ? 'too full' : 'running empty'})` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {(dataFlag || dataProblem) && (
        <Banner
          title="One stock count here looks wrong."
          action={dataProblem && <Link to={`/problems/${dataProblem.id}`} className="font-semibold text-[#6B4100]">See the problem</Link>}
        >
          {dataFlag?.note ?? dataProblem?.seen} Nothing is sent for that product until it is counted again.
        </Banner>
      )}

      <Card className="flex flex-wrap gap-8">
        <div className="flex min-w-0 flex-1 basis-80 flex-col gap-3">
          <div><StatusChip status={store.status} /></div>
          <h1 className="m-0 font-heading text-4xl font-normal md:text-[42px]">{store.city}</h1>
          <p className="m-0 text-[17px] text-muted">
            Store {id} · {store.tier} store · {store.zone} zone
            {whLead !== undefined && ` · ${days(whLead)} from the warehouse`}
          </p>
          <p className="m-0 text-[17px] leading-relaxed">{summaryLine(store, all.length, belowMin)}</p>
          {newStore && (
            <p className="m-0 text-[15px] text-muted">
              Opened {dateLong(store.opened_on)}. {newStore.title}{' '}
              <Link to={`/problems/${newStore.id}`} className="font-semibold text-[#A8340A]">What we found</Link>
            </p>
          )}
        </div>
        <div className="flex min-w-0 flex-1 basis-80 flex-col gap-5 rounded-2xl bg-tint p-5 md:p-7">
          <FillBar
            label="Today"
            value={store.stock_now}
            capacity={store.capacity}
            color="bg-[#2F6F95]"
            note={onTheWay > 0 ? `Includes ${pieces(onTheWay)} on the way, not on the shelf yet.` : undefined}
          />
          <FillBar label="After today's plan" value={store.stock_after} capacity={store.capacity} color="bg-ok" />
          <div className="flex gap-8">
            <div><div className="font-heading text-3xl text-ok">+{num(store.in_units)}</div>coming in</div>
            <div><div className="font-heading text-3xl text-[#8A2C07]">−{num(store.out_units)}</div>going out</div>
          </div>
        </div>
      </Card>

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Stat value={num(store.sold_out_with_demand)} label="products sold out that people buy here" danger={store.sold_out_with_demand > 0} />
        <Stat value={num(store.low_cover_skus)} label="products with less than 3 weeks of stock" />
        <Stat value={inrShort(store.at_risk_week_inr)} label="a week of sales at risk on empty shelves, at tag price" />
      </section>

      <Section n={1} title="Shelves by category" explainer="Each category must keep a minimum on display. The line marks that minimum. These rows count pieces on the shelf, not pieces on the way.">
        <CategoryBars categories={store.categories} />
      </Section>

      {all.length === 0 ? (
        <EmptyState title="Nothing to move for this store today" body="Its stock is where it should be. Check again after tomorrow's run." />
      ) : (
        <>
          <Section
            n={2}
            title="What arrives, and when"
            explainer={
              incoming.length
                ? [fromWh && `${pieces(fromWh)} from the warehouse`, fromStores && `${pieces(fromStores)} from other stores`].filter(Boolean).join(', ') + '. Largest first.'
                : 'Nothing arrives here today.'
            }
          >
            <div className="flex flex-col gap-4">
              {incoming.slice(0, SHOW_INCOMING).map((m) => (
                <Link
                  key={m.id}
                  to={`/moves?move=${m.id}`}
                  className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl bg-white px-5 py-5 text-ink no-underline shadow-card hover:ring-2 hover:ring-tint md:px-7"
                >
                  <div className="min-w-0 flex-1 basis-60">
                    <div className="text-[17px] font-bold">{m.style_name}</div>
                    <div className="mt-0.5 text-sm text-muted">
                      Size {m.size} · from {m.from === 'WH-KOL' ? 'the warehouse' : storeLabel(m.from, file.stores)} · <span className="whitespace-nowrap">arrives {dateShort(m.arrives_on)}</span>
                    </div>
                  </div>
                  <div className="w-20 flex-none text-xl font-bold">+{num(m.qty)}</div>
                  <div className="min-w-0 flex-1 basis-48 text-[15px]">
                    <span className="font-bold whitespace-nowrap text-[#8A2C07]">{days(m.to_before.cover_days)}</span> of stock today,{' '}
                    <span className="font-bold whitespace-nowrap text-ok">{days(m.to_after.cover_days)}</span> after
                  </div>
                  <MoveChip status={approvals.statusOf(m.id)} signoff={m.needs_signoff} />
                </Link>
              ))}
              <Link to={`/moves?store=${id}`} className="flex min-h-11 items-center self-center font-semibold text-[#A8340A]">
                {all.length === 1 ? 'See this entry in All moves' : `See all ${num(all.length)} entries for this store`}
              </Link>
            </div>
          </Section>

          <section className="flex flex-wrap gap-6">
            <Card className="flex min-w-0 flex-1 basis-96 flex-col gap-3">
              <h2 className="m-0 font-heading text-2xl font-normal">What leaves this store</h2>
              <p className="m-0 leading-relaxed">{outgoing.length ? outgoingText(outgoing) : 'Nothing leaves this store today.'}</p>
            </Card>
            <div className="flex min-w-0 flex-1 basis-96 flex-col gap-3 rounded-2xl bg-brown p-5 text-page shadow-card md:p-8">
              <h2 className="m-0 font-heading text-2xl font-normal">Approve everything for {store.city}</h2>
              {approvable.length > 0 && (
                <p className="m-0 text-[15px] text-tint">
                  {num(approvable.length)} {approvable.length === 1 ? 'entry' : 'entries'} · {inr(valueApprovable)} at tag price
                  {signoff.length === 0 && ' · nothing above the sign-off limit'}
                </p>
              )}
              {approvable.length === 0 ? (
                <p className="m-0 text-[15px] text-tint">Every entry for this store needs a manager's sign-off, so none can be approved in one go.</p>
              ) : open.length > 0 ? (
                <Button onClick={() => approvals.approveMoves(open.map((m) => m.id))}>
                  Approve {num(open.length)} {open.length === 1 ? 'entry' : 'entries'}
                </Button>
              ) : (
                <div className="flex min-h-12 items-center justify-center rounded-xl bg-ok-bg font-bold text-ok">Approved</div>
              )}
              {signoff.length > 0 && (
                <div className="flex flex-col gap-2 rounded-xl bg-white/10 p-4 text-[15px]">
                  <span className="font-semibold">
                    Needs a manager's sign-off first ({num(signoff.length)}), not included above:
                  </span>
                  {signoff.map((m) => (
                    <Link key={m.id} to={`/moves?move=${m.id}`} className="text-page underline">
                      {m.style_name}, size {m.size}: <span className="whitespace-nowrap">{pieces(m.qty)}</span>, <span className="whitespace-nowrap">{inr(m.value_inr)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function FillBar({ label, value, capacity, color, note }: { label: string; value: number; capacity: number; color: string; note?: string }) {
  const p = pct(value, capacity);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap justify-between gap-2">
        <span className="font-semibold">{label}</span>
        <span><span className="font-bold">{num(value)}</span> of {pieces(capacity)} · {p}%</span>
      </div>
      {note && <p className="m-0 -mt-1 text-sm text-muted">{note}</p>}
      <div className="h-3.5 rounded-full bg-[#EADFC8]">
        <div className={`h-3.5 rounded-full ${p > 100 ? 'bg-danger' : color}`} style={{ width: `${Math.min(100, p)}%` }} />
      </div>
    </div>
  );
}

function Stat({ value, label, danger }: { value: string; label: string; danger?: boolean }) {
  return (
    <Card padded={false} className="p-6">
      <div className={`font-heading text-4xl leading-none ${danger ? 'text-[#8A2C07]' : ''}`}>{value}</div>
      <div className="mt-2 text-muted">{label}</div>
    </Card>
  );
}

function MoveChip({ status, signoff }: { status?: 'approved' | 'skipped'; signoff: boolean }) {
  if (status === 'approved') return <Chip tone="ok">Approved</Chip>;
  if (status === 'skipped') return <Chip>Skipped</Chip>;
  if (signoff) return <Chip tone="warn">Needs sign-off</Chip>;
  return null;
}
