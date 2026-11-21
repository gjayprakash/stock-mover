import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { MovesFile } from '@sm/contract';
import sample from '@sm/contract/moves.sample.json';

export type MovesFileState = {
  /** null only while the first fetch is in flight. */
  data: MovesFile | null;
  loading: boolean;
  /** true when /api/moves failed and we are showing @sm/contract/moves.sample.json. */
  isSample: boolean;
  reload: () => void;
};

const Ctx = createContext<MovesFileState | null>(null);

/** One fetch of GET /api/moves per page load, shared by every screen. */
export function MovesFileProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<MovesFile | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch('/api/moves')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<MovesFile>;
      })
      .then((json) => {
        if (!json || !Array.isArray(json.moves) || !json.run) throw new Error('bad moves file');
        if (alive) { setData(json); setIsSample(false); }
      })
      .catch(() => {
        if (alive) { setData(sample as unknown as MovesFile); setIsSample(true); }
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return <Ctx.Provider value={{ data, loading, isSample, reload }}>{children}</Ctx.Provider>;
}

export function useMovesFile(): MovesFileState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMovesFile must be used inside <MovesFileProvider>');
  return v;
}
