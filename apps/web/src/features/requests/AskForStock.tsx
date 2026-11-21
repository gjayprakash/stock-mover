import { useEffect, useId, useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { Skeleton } from '../../components/Skeleton';
import { dateShort, num } from '../../lib/format';
import { createRequest, getSources, type SourceOption, type SourcesReply } from './api';
import { BLOCKED, dayWord } from './copy';

export type Product = { sku_id: string; style_name: string; size: string };

const inputCls =
  'h-[52px] w-full rounded-xl border-[1.5px] border-[#D9C49C] bg-[#FFFDF8] px-4 text-base text-ink outline-none focus:border-cta';

const SKU_RE = /^[A-Z]{2,4}-\d{1,3}-[A-Z0-9]{1,5}$/;

function arrivesBy(days: number) {
  const d = new Date(Date.now() + days * 86_400_000);
  return dateShort(d.toISOString().slice(0, 10));
}

function chipFor(s: SourceOption, nextClosest: string | undefined) {
  if (s.blocked_reason) return <Chip className="!py-0.5 !text-xs">{BLOCKED[s.blocked_reason]}</Chip>;
  if (s.location_id === 'WH-KOL') return <Chip tone="brown" className="!py-0.5 !text-xs">Warehouse</Chip>;
  if (s.closest) return <Chip tone="ok" className="!py-0.5 !text-xs">Closest</Chip>;
  if (s.location_id === nextClosest) return <Chip className="!py-0.5 !text-xs">Next closest</Chip>;
  return null;
}

/** Section 1: pick a product and a quantity, then one of the places that can spare it. */
export function AskForStock({ store, products, onCreated }: { store: string; products: Product[]; onCreated: () => void }) {
  const ids = useId();
  const [query, setQuery] = useState('');
  const [qtyText, setQtyText] = useState('1');
  const [reply, setReply] = useState<SourcesReply | null>(null);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const typed = query.trim().toUpperCase();
  const product = products.find((p) => p.sku_id === typed);
  const sku = product?.sku_id ?? (SKU_RE.test(typed) ? typed : null);
  const qty = Math.max(0, Math.floor(Number(qtyText) || 0));

  useEffect(() => {
    setReply(null);
    setPicked(null);
    setError(null);
    if (!sku || qty < 1) return;
    let alive = true;
    setLoading(true);
    getSources(store, sku, qty)
      .then((r) => {
        if (!alive) return;
        setReply(r);
        setPicked((r.sources.find((s) => s.closest) ?? r.sources.find((s) => !s.blocked_reason))?.location_id ?? null);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Could not load sources.'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [store, sku, qty]);

  const sources = reply?.sources ?? [];
  const maxKm = Math.max(1, ...sources.map((s) => s.km));
  const nextClosest = sources.find((s) => !s.blocked_reason && !s.closest && s.location_id !== 'WH-KOL' && sources.some((c) => c.closest))?.location_id;
  const pick = sources.find((s) => s.location_id === picked && !s.blocked_reason);
  const ask = pick ? Math.min(qty, pick.can_spare) : 0;

  const summary = useMemo(() => {
    if (!pick) return null;
    const when = `Arrives in about ${dayWord(pick.days)}, by ${arrivesBy(pick.days)}.`;
    if (pick.location_id === 'WH-KOL')
      return `The warehouse can give ${num(pick.can_spare)}. The super admin approves warehouse requests. ${when}`;
    return `${pick.location_id} can give ${num(pick.can_spare)} and stays above 30 days of cover after sending. ${when}`;
  }, [pick]);

  async function send() {
    if (!pick || !sku || ask < 1) return;
    setSending(true);
    setError(null);
    try {
      await createRequest(store, { sku_id: sku, qty: ask, from_location: pick.location_id });
      setDone(`Asked ${pick.location_id} for ${num(ask)}. It is in Your requests below.`);
      setQuery('');
      setQtyText('1');
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the request.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-[1fr_180px]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${ids}-p`} className="text-sm font-semibold">Product and size</label>
          <input
            id={`${ids}-p`}
            list={`${ids}-list`}
            className={inputCls}
            placeholder="Type a name or SKU, e.g. KUR-12-M"
            value={query}
            autoComplete="off"
            onChange={(e) => { setQuery(e.target.value); setDone(null); }}
          />
          <datalist id={`${ids}-list`}>
            {products.map((p) => (
              <option key={p.sku_id} value={p.sku_id}>{`${p.style_name} · ${p.size}`}</option>
            ))}
          </datalist>
          <span className="text-sm text-muted">
            {product ? `${product.style_name} · ${product.size}. ` : ''}
            {reply?.on_hand !== undefined
              ? `You have ${num(reply.on_hand)}. Your store sells about ${num(reply.per_week ?? 0)} a week.`
              : sku ? '' : 'Pick from the list or type the full SKU.'}
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${ids}-q`} className="text-sm font-semibold">How many</label>
          <input
            id={`${ids}-q`}
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            className={inputCls}
            value={qtyText}
            onChange={(e) => { setQtyText(e.target.value); setDone(null); }}
          />
        </div>
      </div>

      {done && <p role="status" className="m-0 font-semibold text-ok">{done}</p>}

      {sku && qty >= 1 && (
        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="mb-3 text-sm font-semibold">Closest places that have it</legend>
          {loading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          {!loading && reply && sources.length === 0 && (
            <p className="m-0 text-muted">No store or warehouse holds {sku} right now.</p>
          )}
          {!loading &&
            sources.map((s) => {
              const blocked = !!s.blocked_reason;
              const on = s.location_id === picked && !blocked;
              return (
                <label
                  key={s.location_id}
                  className={`flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl px-4 py-3 ${
                    on ? 'border-2 border-cta bg-[#FFF6F0]' : 'border-[1.5px] border-line'
                  } ${blocked ? 'cursor-not-allowed bg-[#FAF6EF] text-brown' : 'cursor-pointer bg-white'}`}
                >
                  <input
                    type="radio"
                    name={`${ids}-src`}
                    className="h-5 w-5 accent-cta"
                    checked={on}
                    disabled={blocked}
                    onChange={() => setPicked(s.location_id)}
                  />
                  <div className="min-w-0 flex-[1_1_160px]">
                    <div className="font-semibold">{s.name} <span className="font-normal text-muted">{s.location_id}</span></div>
                  </div>
                  <div className="flex min-w-0 flex-[2_1_200px] items-center gap-3">
                    <div className="h-2 flex-1 rounded-full bg-line" aria-hidden="true">
                      <div className="h-2 rounded-full bg-ok" style={{ width: `${Math.max(3, (s.km / maxKm) * 100)}%` }} />
                    </div>
                    <span className="w-36 shrink-0 text-right text-sm">{num(s.km)} km · {dayWord(s.days)}</span>
                  </div>
                  <span className="w-28 shrink-0 font-semibold">Can give {num(s.can_spare)}</span>
                  <span className="shrink-0">{chipFor(s, nextClosest)}</span>
                </label>
              );
            })}
        </fieldset>
      )}

      {pick && qty > pick.can_spare && (
        <p className="m-0 text-sm font-semibold text-warn">
          {pick.location_id} can give {num(pick.can_spare)}, so the ask is capped at {num(pick.can_spare)}.
        </p>
      )}
      {error && <p role="alert" className="m-0 font-semibold text-danger">{error}</p>}

      {pick && (
        <div className="flex flex-wrap items-center gap-4">
          <p className="m-0 min-w-0 flex-[1_1_300px] text-muted">{summary}</p>
          <Button onClick={send} disabled={sending || ask < 1}>
            {sending ? 'Sending…' : `Ask ${pick.location_id} for ${num(ask)}`}
          </Button>
        </div>
      )}
    </Card>
  );
}
