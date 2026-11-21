import { useCallback, useEffect, useState } from 'react';
import type { RunRow } from '@sm/contract';

export type RunsState = { runs: RunRow[]; loading: boolean; isSample: boolean; reload: () => void };

/** GET /api/runs (newest first). Falls back to [] when the API is down. */
export function useRuns(): RunsState {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSample, setIsSample] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch('/api/runs')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<RunRow[]>;
      })
      .then((json) => {
        if (!Array.isArray(json)) throw new Error('bad runs');
        if (alive) { setRuns(json); setIsSample(false); }
      })
      .catch(() => { if (alive) { setRuns([]); setIsSample(true); } })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [tick]);

  return { runs, loading, isSample, reload: useCallback(() => setTick((t) => t + 1), []) };
}
