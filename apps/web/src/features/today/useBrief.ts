import { useEffect, useState } from 'react';
import type { BriefResponse } from '@sm/contract';

/** GET /api/brief for the hero subline. Optional: null while loading and on any error (the hero then shows its template line). */
export function useBrief(runId: string | undefined): BriefResponse | null {
  const [brief, setBrief] = useState<BriefResponse | null>(null);

  useEffect(() => {
    if (!runId) return;
    let alive = true;
    setBrief(null);
    fetch('/api/brief')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<BriefResponse>;
      })
      .then((json) => {
        if (alive && json && typeof json.text === 'string' && json.text.trim()) setBrief(json);
      })
      .catch(() => { /* optional: hide */ });
    return () => { alive = false; };
  }, [runId]);

  return brief;
}
