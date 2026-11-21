import { useEffect, useState } from 'react';
import type { BriefResponse } from '@sm/contract';

/** GET /api/brief → its `source` ("AI" | "TEMPLATE"); null while loading or when the call fails. Re-fetches when runId changes. */
export function useBriefSource(runId: string): BriefResponse['source'] | null {
  const [source, setSource] = useState<BriefResponse['source'] | null>(null);
  useEffect(() => {
    let alive = true;
    setSource(null);
    fetch('/api/brief')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<BriefResponse>;
      })
      .then((b) => {
        if (alive && (b?.source === 'AI' || b?.source === 'TEMPLATE')) setSource(b.source);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [runId]);
  return source;
}
