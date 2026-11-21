import { useState } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { EmptyState } from '../../components/EmptyState';
import { dateShort, num, timeShort } from '../../lib/format';
import { act, type TransferRequest } from './api';
import { productName, statusChip } from './copy';

function updated(iso: string) {
  const today = dateShort(new Date().toISOString());
  const day = dateShort(iso);
  return day === today ? `Today, ${timeShort(iso)}` : day;
}

/** Section 3: what this store asked for, newest first. Cancel while the giver has not answered. */
export function YourRequests({ rows, label, store, onChanged }: { rows: TransferRequest[]; label: (id: string) => string; store: string; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cancel(id: string) {
    setBusy(id);
    setError(null);
    try {
      await act(store, id, 'cancel');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel.');
    } finally {
      setBusy(null);
      onChanged();
    }
  }

  if (rows.length === 0) return <EmptyState title="No requests yet" body="Ask for stock above and it shows up here." />;
  return (
    <Card padded={false} className="overflow-hidden">
      {error && <p role="alert" className="m-0 px-6 pt-4 text-sm font-semibold text-danger">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[15px]">
          <thead>
            <tr className="bg-page text-left text-sm text-muted">
              <th className="py-4 pr-3 pl-6">Product</th>
              <th className="px-3 py-4">From</th>
              <th className="px-3 py-4 text-right">Pieces</th>
              <th className="px-3 py-4">Status</th>
              <th className="px-3 py-4">Updated</th>
              <th className="py-4 pr-6 pl-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const chip = statusChip(r);
              return (
                <tr key={r.id} className="border-t border-line">
                  <td className="py-4 pr-3 pl-6">
                    <div className="font-semibold">{productName(r)}</div>
                    <div className="text-sm text-muted">{r.sku_id}</div>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap">{label(r.from_location)}</td>
                  <td className="px-3 py-4 text-right">{num(r.qty)}</td>
                  <td className="px-3 py-4"><Chip tone={chip.tone}>{chip.label}</Chip></td>
                  <td className="px-3 py-4 whitespace-nowrap text-muted">{updated(r.updated_at)}</td>
                  <td className="py-4 pr-6 pl-3 text-right">
                    {r.status === 'waiting' && (
                      <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => cancel(r.id)}>
                        Cancel
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
