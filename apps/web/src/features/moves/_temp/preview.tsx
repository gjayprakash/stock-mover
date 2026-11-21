// TEMPORARY harness: open /src/features/moves/_temp/preview.html on the dev server. Delete with _temp/.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { MovesFile } from '@sm/contract';
import movesUrl from '@sm/contract/moves.sample.json?url';
import { MovesView } from '../MovesView';
import { readFilters, writeFilters, type Filters } from '../filters';
import './preview.css';

function App() {
  const [file, setFile] = useState<MovesFile | null>(null);
  const [filters, setF] = useState<Filters>(readFilters(new URLSearchParams(location.search)));
  const [st, setSt] = useState<Record<string, 'approved' | 'skipped'>>({});
  useEffect(() => { setTimeout(() => fetch(movesUrl).then((r) => r.json()).then(setFile), 600); }, []);
  const set = (ids: string[], v?: 'approved' | 'skipped') =>
    setSt((s) => { const n = { ...s }; ids.forEach((i) => (v ? (n[i] = v) : delete n[i])); return n; });
  return (
    <MovesView
      file={file} loading={!file} filters={filters}
      onFiltersChange={(f) => { setF(f); const q = writeFilters(f).toString(); history.replaceState(null, '', q ? `?${q}` : location.pathname); }}
      statusOf={(id) => st[id]} approveMoves={(ids) => set(ids, 'approved')} skipMoves={(ids) => set(ids, 'skipped')} undo={(ids) => set(ids)}
      approvedCount={Object.values(st).filter((v) => v === 'approved').length}
      onDownloadCsv={() => alert('csv: ' + Object.keys(st).filter((k) => st[k] === 'approved').join(','))}
    />
  );
}
createRoot(document.getElementById('root')!).render(<App />);
