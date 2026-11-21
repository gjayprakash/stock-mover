import { useEffect, useState } from 'react';
import type { AiLog } from './sample';

/** GET /api/ai/log?run=<run_id>. log = null while loading or when the call failed (error = true). */
export function useAiLog(runId: string | undefined) {
  const [log, setLog] = useState<AiLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!runId) return;
    let alive = true;
    setLoading(true);
    fetch(`/api/ai/log?run=${encodeURIComponent(runId)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<AiLog>;
      })
      .then((json) => {
        if (!json || !Array.isArray(json.calls) || !json.totals) throw new Error('bad log');
        if (alive) { setLog(json); setError(false); }
      })
      .catch(() => alive && (setLog(null), setError(true)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [runId]);

  return { log, loading, error };
}
