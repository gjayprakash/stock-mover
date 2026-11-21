import { useEffect, useState } from 'react';
import type { HistoryFile } from '@sm/contract';
import sample from '@sm/contract/history.sample.json';

export type HistoryState = { data: HistoryFile; loading: boolean; isSample: boolean };

function pick(file: HistoryFile, keys: string[]): HistoryFile {
  const out: HistoryFile = {};
  for (const k of keys) if (file[k]) out[k] = file[k];
  return out;
}

/** GET /api/history?keys=STORE|SKU,... — keys look like "PAT-02|KUR-02-M". Falls back to history.sample.json. */
export function useHistory(keys: string[]): HistoryState {
  const joined = [...new Set(keys)].sort().join(',');
  const [state, setState] = useState<HistoryState>({ data: {}, loading: keys.length > 0, isSample: false });

  useEffect(() => {
    if (!joined) { setState({ data: {}, loading: false, isSample: false }); return; }
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fetch(`/api/history?keys=${encodeURIComponent(joined)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<HistoryFile>;
      })
      .then((json) => {
        if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('bad history');
        if (alive) setState({ data: json, loading: false, isSample: false });
      })
      .catch(() => {
        if (alive) setState({ data: pick(sample as unknown as HistoryFile, joined.split(',')), loading: false, isSample: true });
      });
    return () => { alive = false; };
  }, [joined]);

  return state;
}
