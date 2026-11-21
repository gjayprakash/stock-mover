import { useId, useState } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { EmptyState } from '../../components/EmptyState';
import { inr, num } from '../../lib/format';
import { act, type Action, type DeclineReason, type TransferRequest } from './api';
import { DECLINE, SIGNOFF_OVER, ago, dayWord, productName } from './copy';

type Props = {
  rows: TransferRequest[];
  label: (id: string) => string;
  superAdmin: boolean;
  store: string;
  onChanged: () => void;
};

function RequestCard({ r, label, superAdmin, store, onChanged }: Omit<Props, 'rows'> & { r: TransferRequest }) {
  const ids = useId();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState<DeclineReason>('need_it_here');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const over = r.value_mrp > SIGNOFF_OVER;
  const keeps = r.giver_on_hand !== undefined ? r.giver_on_hand - r.qty : null;

  async function run(action: Action) {
    setBusy(true);
    setError(null);
    try {
      await act(store, r.id, action, action === 'decline' ? reason : undefined);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Asked {ago(r.created_at)}</span>
        {over && <Chip tone="warn" className="!py-0.5 !text-xs">Needs super admin sign-off too</Chip>}
      </div>
      <p className="m-0 text-lg font-semibold">
        {label(r.to_location)} asks for {num(r.qty)} × {productName(r)}.
      </p>
      {keeps !== null && (
        <p className="m-0 text-muted">
          You have {num(r.giver_on_hand!)}. After sending {num(r.qty)} you keep {num(keeps)}
          {r.giver_cover_days_after != null ? `, which is ${dayWord(r.giver_cover_days_after)} of cover` : ''}. Your display
          minimum still holds.
        </p>
      )}
      <p className="m-0 text-sm text-muted">
        Value {inr(r.value_mrp)} at MRP
        {r.days !== undefined ? ` · ${dayWord(r.days)} to ${label(r.to_location)}` : ''}
        {over ? ' · over Rs 1,00,000, so the super admin approves after you' : ''}
      </p>

      {r.status === 'needs_signoff' ? (
        superAdmin ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" disabled={busy} onClick={() => run('signoff')}>Sign off</Button>
            <span className="text-sm text-muted">The giving store approved. Your sign-off sends it.</span>
          </div>
        ) : (
          <p className="m-0 font-semibold text-warn">You approved. Waiting for the super admin's sign-off.</p>
        )
      ) : declining ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${ids}-r`} className="text-sm font-semibold">Why decline?</label>
            <select
              id={`${ids}-r`}
              className="h-9 rounded-xl border-[1.5px] border-[#D9C49C] bg-[#FFFDF8] px-3 text-ink"
              value={reason}
              onChange={(e) => setReason(e.target.value as DeclineReason)}
            >
              {(Object.keys(DECLINE) as DeclineReason[]).map((k) => (
                <option key={k} value={k}>{DECLINE[k]}</option>
              ))}
            </select>
          </div>
          <Button size="sm" disabled={busy} onClick={() => run('decline')}>Decline</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDeclining(false)}>Back</Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button size="sm" disabled={busy} onClick={() => run('approve')}>Approve</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setDeclining(true)}>Decline</Button>
        </div>
      )}
      {error && <p role="alert" className="m-0 text-sm font-semibold text-danger">{error}</p>}
    </Card>
  );
}

/** Section 2: other stores' asks of this store, still waiting for an answer (or for the super admin). */
export function WaitingForYou({ rows, ...rest }: Props) {
  const open = rows.filter((r) => r.status === 'waiting' || r.status === 'needs_signoff');
  if (open.length === 0) return <EmptyState title="Nothing waiting" body="No store has asked you for stock." />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {open.map((r) => <RequestCard key={r.id} r={r} {...rest} />)}
    </div>
  );
}
