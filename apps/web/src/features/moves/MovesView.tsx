import { Fragment, useEffect, useMemo, useState } from 'react';
import type { Move, MovesFile } from '@sm/contract';
import { Button, Card, inr } from './deps';
import { applyFilters, EMPTY_FILTERS, type ApprovalStatus, type Filters } from './filters';
import { MovesFilters } from './MovesFilters';
import { MoveRow } from './MoveRow';
import { MoveDetail } from './MoveDetail';

const PAGE = 50;

export type MovesViewProps = {
  file: MovesFile | null;
  loading: boolean;
  error?: string | null;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  statusOf: (id: string) => ApprovalStatus;
  approveMoves: (ids: string[]) => void;
  skipMoves: (ids: string[]) => void;
  undo: (ids: string[]) => void;
  approvedCount: number;
  onDownloadCsv: () => void;
};

export function MovesView(p: MovesViewProps) {
  const { file, filters } = p;
  const rows = useMemo(() => (file ? applyFilters(file, filters) : []), [file, filters]);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');

  // Filters change -> page 1 (or the page holding ?move=), clear selection.
  const filterKey = JSON.stringify({ ...filters, move: '' });
  useEffect(() => {
    const i = filters.move ? rows.findIndex((m) => m.id === filters.move) : -1;
    setPage(i >= 0 ? Math.floor(i / PAGE) : 0);
    setSelected(new Set());
  }, [filterKey, file]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!filters.move) return;
    document.getElementById(`move-${filters.move}`)?.scrollIntoView({ block: 'center' });
  }, [filters.move, page]);

  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);
  const pageSelectable = pageRows.filter((m) => !p.statusOf(m.id));
  const allOnPage = pageSelectable.length > 0 && pageSelectable.every((m) => selected.has(m.id));
  const chosen: Move[] = rows.filter((m) => selected.has(m.id));

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const expand = (id: string) => p.onFiltersChange({ ...filters, move: filters.move === id ? '' : id });

  const approveSelected = () => {
    const ok = chosen.filter((m) => !m.needs_signoff).map((m) => m.id);
    const held = chosen.length - ok.length;
    if (ok.length) p.approveMoves(ok);
    setNote(held ? `${held} need sign-off, review individually.` : '');
    setSelected(new Set(chosen.filter((m) => m.needs_signoff).map((m) => m.id)));
  };
  const skipSelected = () => {
    p.skipMoves(chosen.map((m) => m.id));
    setNote('');
    setSelected(new Set());
  };

  const nf = new Intl.NumberFormat('en-IN');
  const th = 'px-3 py-4 font-bold';

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-4 pb-32 pt-8 md:px-8 md:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 font-heading text-[34px] font-normal leading-tight md:text-[42px]">
            {file ? `All ${nf.format(file.summary.moves)} entries` : 'All moves'}
          </h1>
          <p className="m-0 max-w-[640px] text-[17px] text-[#5E4E42]">
            The full list behind today's fixes. Filter it, check any line, and approve in bulk.
          </p>
        </div>
        <span title={p.approvedCount ? undefined : 'Approve at least one move first'}>
          <Button variant="outline" disabled={!p.approvedCount} onClick={p.onDownloadCsv}>
            Download approved list (CSV){p.approvedCount ? ` · ${p.approvedCount}` : ''}
          </Button>
        </span>
      </div>

      {p.error && !file && (
        <div role="alert" className="rounded-xl bg-[#FDE9DD] px-6 py-4 text-[#8A2C07]">Could not load moves: {p.error}</div>
      )}

      {file && <MovesFilters file={file} filters={filters} onChange={(f) => { setNote(''); p.onFiltersChange(f); }} />}

      {filters.problem && file && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-tint px-6 py-3 text-[15px]">
          Showing the moves for problem {filters.problem}
          {file.problems.find((x) => x.id === filters.problem)?.title ? `: ${file.problems.find((x) => x.id === filters.problem)!.title}` : ''}
          <button type="button" className="font-semibold text-cta underline" onClick={() => p.onFiltersChange({ ...filters, problem: '', move: '' })}>
            Show all
          </button>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-[15px]">
            <thead>
              <tr className="bg-page text-left text-sm text-[#4A3A2E]">
                <th className="w-11 py-4 pl-5 pr-3 md:pl-7">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={allOnPage}
                    disabled={!pageSelectable.length}
                    onChange={(e) =>
                      setSelected((s) => {
                        const n = new Set(s);
                        pageSelectable.forEach((m) => (e.target.checked ? n.add(m.id) : n.delete(m.id)));
                        return n;
                      })
                    }
                    className="h-5 w-5 accent-[#C7400E]"
                  />
                </th>
                <th className={th}>Product</th>
                <th className={th}>From, to</th>
                <th className={th}>Pieces</th>
                <th className={th}>Days of stock</th>
                <th className={th}>Arrives</th>
                <th className="py-4 pl-3 pr-5 font-bold md:pr-7">Why</th>
              </tr>
            </thead>
            <tbody>
              {p.loading && !file &&
                Array.from({ length: 8 }, (_, i) => (
                  <tr key={i} className="border-t border-[#F3E8D2]">
                    <td colSpan={7} className="px-7 py-5"><div className="h-10 animate-pulse rounded-lg bg-tint" /></td>
                  </tr>
                ))}
              {pageRows.map((m) => {
                const open = filters.move === m.id;
                const status = p.statusOf(m.id);
                return (
                  <Fragment key={m.id}>
                    <MoveRow
                      move={m}
                      status={status}
                      selected={selected.has(m.id)}
                      expanded={open}
                      onSelect={(on) => toggle(m.id, on)}
                      onToggle={() => expand(m.id)}
                    />
                    {open && (
                      <tr id={`move-${m.id}`}>
                        <td colSpan={7} className="p-0">
                          <MoveDetail
                            move={m}
                            status={status}
                            onApprove={() => { p.approveMoves([m.id]); toggle(m.id, false); }}
                            onSkip={() => { p.skipMoves([m.id]); toggle(m.id, false); }}
                            onUndo={() => p.undo([m.id])}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {file && rows.length === 0 && (
          <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
            <p className="m-0 text-lg font-semibold">Nothing matches these filters</p>
            <Button variant="outline" onClick={() => p.onFiltersChange(EMPTY_FILTERS)}>Clear filters</Button>
          </div>
        )}

        {file && rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-[#F3E8D2] px-5 py-4 text-[15px] text-[#5E4E42] md:px-7">
            <span>
              Showing {nf.format(page * PAGE + 1)} to {nf.format(page * PAGE + pageRows.length)} of {nf.format(rows.length)} · sorted by most urgent
            </span>
            <span className="flex items-center gap-4">
              <span className="flex items-center gap-1.5"><span className="h-[9px] w-[9px] rounded-full bg-ok" />Store's own sales</span>
              <span className="flex items-center gap-1.5"><span className="h-[9px] w-[9px] rounded-full bg-warn" />Similar stores' sales</span>
            </span>
            <span className="flex gap-2">
              <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button variant="outline" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)}>Next</Button>
            </span>
          </div>
        )}
      </Card>

      {(chosen.length > 0 || note) && (
        <section className="sticky bottom-20 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl bg-brown px-6 py-4 text-[#FFFBF2] shadow-[0_16px_40px_rgba(81,29,0,0.35)] md:bottom-6">
          <span className="text-base">
            {chosen.length > 0 ? (
              <>
                <span className="font-bold">{chosen.length} selected</span> · {nf.format(chosen.reduce((s, m) => s + m.qty, 0))} pieces ·{' '}
                {inr(chosen.reduce((s, m) => s + m.value_inr, 0))}
              </>
            ) : null}
            {note && <span className="ml-2 font-semibold text-[#F4A27C]">{note}</span>}
          </span>
          {chosen.length > 0 && (
            <span className="flex flex-wrap gap-2.5">
              <button type="button" onClick={skipSelected} className="h-12 rounded-[10px] border-[1.5px] border-[#8A5A3C] px-5 font-semibold">
                Skip selected
              </button>
              <button type="button" onClick={approveSelected} className="h-12 rounded-[10px] bg-cta px-6 font-semibold text-white">
                Approve selected
              </button>
            </span>
          )}
        </section>
      )}
    </div>
  );
}
