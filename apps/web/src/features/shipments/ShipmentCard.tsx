import { useId, useState } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { dateShort, inr } from '../../lib/format';
import type { Dir, Driver, Shipment } from './api';
import { AssignDriver } from './AssignDriver';
import { statusChip, steps, timeAgo, when } from './status';

type Props = {
  s: Shipment;
  dir: Dir;
  drivers: Driver[] | null;
  onAssign: (driverId: string) => Promise<void>;
  onReceive: (qty: number) => Promise<void>;
};

const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const sameCity = (a: string, b: string) => a.slice(0, 3) === b.slice(0, 3);

/** Selected shipment: route header, due date, 6-step tracker, last place + map, driver, places sent, Mark received. */
export function ShipmentCard({ s, dir, drivers, onAssign, onReceive }: Props) {
  const chip = statusChip(s, dir);
  const last = s.pings[0];
  const from = dir === 'in' ? s.from_id : 'you';
  const to = dir === 'in' ? 'you' : s.to_id;
  const canReceive = dir === 'in' && (s.status === 'in_transit' || s.status === 'delivered');

  return (
    <Card className="flex flex-col gap-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Chip tone={chip.tone} className="self-start">{chip.label}</Chip>
          <h2 className="m-0 font-heading text-[30px] font-normal leading-tight text-ink">
            {s.qty} {s.style_name}{s.qty === 1 ? '' : 's'}, size {s.size}
          </h2>
          <div className="text-[17px] text-[#2E221A]">
            From <b>{from === 'you' ? 'you' : from}</b> to <b>{to}</b> · {inr(s.value_mrp)} at MRP
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-muted">Due</div>
          <div className="font-heading text-[28px]">{dateShort(s.due_date)}</div>
          <div className="text-sm text-muted">
            {s.from_id === 'WH-KOL' ? 'from the warehouse' : sameCity(s.from_id, s.to_id) ? 'same city' : 'other city'}, {s.lead_time_days} days
          </div>
        </div>
      </div>

      <Tracker s={s} />

      <div className="grid gap-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col overflow-hidden rounded-2xl bg-[#FAF3E7]">
          <RouteMap s={s} fromLabel={dir === 'in' ? s.from_id : `You, ${s.from_id}`} toLabel={dir === 'in' ? `You, ${s.to_id}` : s.to_id} />
          <div className="flex flex-col gap-1 px-5 py-4">
            {last ? (
              <>
                <div className="text-[17px] font-bold">Last seen near {last.place}</div>
                <div className="text-[15px] text-[#4A3A2E]">{timeAgo(last.taken_at)} · from the driver's phone</div>
                <a
                  href={`https://www.google.com/maps?q=${last.lat},${last.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex min-h-11 items-center self-start font-semibold"
                >
                  Open in Google Maps
                </a>
              </>
            ) : (
              <div className="text-[15px] text-[#4A3A2E]">
                {s.driver ? 'No location yet. It shows here as soon as the driver opens the Stock Mover app.' : 'No driver yet.'}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-line p-5">
            {s.driver ? (
              <>
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-tint font-bold text-brown" aria-hidden="true">
                    {initials(s.driver.name)}
                  </span>
                  <div>
                    <div className="text-[17px] font-bold">{s.driver.name}</div>
                    <div className="text-sm font-semibold text-ok">Driver</div>
                  </div>
                </div>
                <a
                  href={`tel:${s.driver.phone_e164}`}
                  className="flex h-12 items-center justify-center gap-2 rounded-xl border-[1.5px] border-[#D9C49C] font-semibold text-[#4A3A2E] no-underline hover:bg-page"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
                  </svg>
                  Call {s.driver.name.split(' ')[0]}
                </a>
              </>
            ) : dir === 'out' && s.status === 'approved' ? (
              <>
                <div className="text-[15px] font-bold">No driver yet</div>
                <AssignDriver drivers={drivers} onAssign={onAssign} />
              </>
            ) : (
              <div className="text-[15px] text-muted">No driver yet. The giving store assigns one.</div>
            )}
          </div>

          {s.pings.length > 0 && (
            <div className="flex flex-col gap-2.5 rounded-2xl border-[1.5px] border-line p-5">
              <div className="text-[15px] font-bold">Places sent</div>
              {s.pings.map((p) => (
                <div key={p.taken_at} className="flex justify-between gap-3 text-[15px]">
                  <span>{p.place}</span>
                  <span className="whitespace-nowrap text-muted">{when(p.taken_at)}</span>
                </div>
              ))}
            </div>
          )}

          {s.status === 'received' && s.qty_received !== null && s.qty_received < s.qty && (
            <div className="rounded-xl bg-warn-bg px-4 py-3 text-[15px] text-[#6B4100]">
              Short by {s.qty - s.qty_received}: {s.qty_received} of {s.qty} pieces received. {dir === 'in' ? 'The giving store has been told.' : 'Noted by the receiving store.'}
            </div>
          )}

          {canReceive && <ReceiveForm qty={s.qty} onReceive={onReceive} />}
        </div>
      </div>
    </Card>
  );
}

function Tracker({ s }: { s: Shipment }) {
  return (
    <ol aria-label="Progress" className="m-0 grid list-none grid-cols-3 gap-y-5 p-0 md:grid-cols-6">
      {steps(s).map((st, i) => (
        <li key={st.label} className="flex flex-col items-start gap-2.5" aria-current={st.state === 'now' ? 'step' : undefined}>
          <div className="flex w-full items-center">
            <span
              className={`flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-white ${
                st.state === 'done' ? 'bg-ok' : st.state === 'now' ? 'bg-cta' : 'border-2 border-[#D9C49C] bg-white'
              }`}
            >
              {st.state === 'done' && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12l5 5 9-10" />
                </svg>
              )}
            </span>
            {i < 5 && <span className={`h-1 flex-1 ${st.state === 'done' ? 'bg-ok' : 'bg-line'}`} />}
          </div>
          <span className={`text-[15px] font-bold ${st.state === 'todo' ? 'text-[#6B5B4E]' : 'text-ink'}`}>
            {st.label}
            <span className="sr-only">{st.state === 'done' ? ' (done)' : st.state === 'now' ? ' (now)' : ''}</span>
          </span>
          <span className="text-sm text-muted">{st.time}</span>
        </li>
      ))}
    </ol>
  );
}

/** Static route sketch (phase 1): giver → receiver, driver dot placed by progress. Not a real map. */
function RouteMap({ s, fromLabel, toLabel }: { s: Shipment; fromLabel: string; toLabel: string }) {
  const t = { approved: 0, assigned: 0, in_transit: 0.55, delivered: 1, received: 1 }[s.status];
  const [a, c, b] = [[90, 143], [300, 40], [470, 72]];
  const pt = (k: number) => a.map((_, i) => (1 - k) ** 2 * a[i] + 2 * (1 - k) * k * c[i] + k ** 2 * b[i]);
  const [dx, dy] = pt(t);
  const last = s.pings[0]?.place;
  return (
    <svg
      viewBox="0 0 560 220"
      width="100%"
      role="img"
      aria-label={last ? `Route sketch: last seen near ${last}, between ${fromLabel} and ${toLabel}` : `Route sketch from ${fromLabel} to ${toLabel}`}
      className="block bg-[#EFE6D6]"
    >
      <path d="M0 150 C120 140 200 90 300 100 S470 60 560 70" fill="none" stroke="#FFFFFF" strokeWidth="14" />
      <path d="M60 0 L140 220 M380 0 L330 220 M0 40 L560 190" fill="none" stroke="#FFFFFF" strokeWidth="7" />
      <path d={`M${a} Q${c} ${b}`} fill="none" stroke="#C7400E" strokeWidth="4" strokeDasharray="2 9" strokeLinecap="round" />
      <circle cx={a[0]} cy={a[1]} r="9" fill="#511D00" />
      <text x={a[0]} y={a[1] + 29} textAnchor="middle" fontSize="14" fontWeight="700" fill="#1F1410">{fromLabel}</text>
      <circle cx={b[0]} cy={b[1]} r="9" fill="#1D6B4F" />
      <text x={b[0]} y={b[1] - 20} textAnchor="middle" fontSize="14" fontWeight="700" fill="#1F1410">{toLabel}</text>
      {s.status !== 'approved' && s.status !== 'assigned' && (
        <>
          <circle cx={dx} cy={dy} r="18" fill="#C7400E" opacity="0.18" />
          <circle cx={dx} cy={dy} r="9" fill="#C7400E" stroke="#FFFFFF" strokeWidth="3" />
        </>
      )}
    </svg>
  );
}

/** Mark received → asks pieces received; a short count is sent as is and flagged to the giver by the API. */
function ReceiveForm({ qty, onReceive }: { qty: number; onReceive: (qty: number) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(qty));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const n = Number(value);
  const valid = value !== '' && Number.isInteger(n) && n >= 0 && n <= qty;

  if (!open) {
    return (
      <Button full onClick={() => setOpen(true)}>Mark received</Button>
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onReceive(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-line p-5">
      <label htmlFor={id} className="text-[15px] font-bold">How many pieces arrived?</label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={qty}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-12 w-24 rounded-xl border-[1.5px] border-[#D9C49C] px-3 text-lg"
        />
        <span className="text-muted">of {qty} sent</span>
      </div>
      {valid && n < qty && <p className="m-0 text-sm text-[#6B4100]">Short by {qty - n}. The giving store will be told.</p>}
      {!valid && <p className="m-0 text-sm text-danger">Enter a whole number from 0 to {qty}.</p>}
      {error && <p role="alert" className="m-0 text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button disabled={!valid || busy} onClick={submit}>{busy ? 'Saving…' : 'Confirm received'}</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}
