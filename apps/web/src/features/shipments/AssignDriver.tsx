import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import type { Driver } from './api';

type Props = { drivers: Driver[] | null; onAssign: (driverId: string) => Promise<void> };

/** "Assign a driver" → picker of this store's paired drivers; link to Drivers when none is paired. */
export function AssignDriver({ drivers, onAssign }: Props) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const paired = (drivers ?? []).filter((d) => d.status === 'Paired' || d.status === 'PAIRED');

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Assign a driver
      </Button>
    );
  }
  if (drivers && paired.length === 0) {
    return (
      <span className="text-sm text-muted">
        No paired driver yet. <Link to="/drivers" className="font-semibold text-cta">Add one in Drivers</Link>
      </span>
    );
  }

  async function submit() {
    if (!pick) return;
    setBusy(true);
    setError(null);
    try {
      await onAssign(pick);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not assign');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="sr-only">Driver</label>
        <select
          id={id}
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          className="min-h-9 rounded-lg border border-line bg-white px-2 text-sm"
        >
          <option value="">Pick a driver…</option>
          {paired.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <Button size="sm" disabled={!pick || busy} onClick={submit}>
          {busy ? 'Assigning…' : 'Assign'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
      {error && <span role="alert" className="text-sm text-danger">{error}</span>}
    </div>
  );
}
