import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMovesFile } from '../data/useMovesFile';
import { useApprovals } from '../data/approvals';
import { downloadApprovedCsv } from '../lib/csv';
import { MovesView } from '../features/moves/MovesView';
import { readFilters, writeFilters } from '../features/moves/filters';

/** All moves (#14). Filters live in the URL so deep links and the back button work. */
export default function MovesPage() {
  const [params, setParams] = useSearchParams();
  const { data, loading } = useMovesFile();
  const a = useApprovals();
  const key = params.toString();
  const filters = useMemo(() => readFilters(new URLSearchParams(key)), [key]);
  return (
    <MovesView
      file={data}
      loading={loading}
      filters={filters}
      onFiltersChange={(f) => setParams(writeFilters(f))}
      statusOf={a.statusOf}
      approveMoves={a.approveMoves}
      skipMoves={a.skipMoves}
      undo={a.undo}
      approvedCount={a.counts.approved}
      onDownloadCsv={() => data && downloadApprovedCsv(data, a.state)}
    />
  );
}
