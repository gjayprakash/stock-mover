import { DeliveryNote } from '../deliveries/DeliveryNote';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Move, MovesFile } from '@sm/contract';
import { Button, Card, Chip, EmptyState, inr } from './deps';
import { applyFilters, EMPTY_FILTERS, type ApprovalStatus, type Filters } from './filters';
import { MovesFilters } from './MovesFilters';
import { MoveRow, PIN } from './MoveRow';
import { MovePanel } from './MovePanel';
import { AllMovesContext, ClosestBanner } from './Distance';

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

  // ?move=<id> is the source of truth for the panel. Keep the table on the page that holds it.
  useEffect(() => {
    const i = filters.move ? rows.findIndex((m) => m.id === filters.move) : -1;
    if (i >= 0) setPage(Math.floor(i / PAGE));
  }, [filters.move]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bring the open row into view, but never for a row click: only for deep links (on load) and Prev/Next.
  // block 'nearest' means no movement at all when the row is already visible.
  const fromClick = useRef(false);
  const scrolledTo = useRef('');
  useEffect(() => {
    if (!filters.move) { scrolledTo.current = ''; return; }
    if (fromClick.current) { fromClick.current = false; scrolledTo.current = filters.move; return; }
    if (scrolledTo.current === filters.move) return;
    const id = setTimeout(() => {
      const el = document.getElementById(`row-${filters.move}`);
      if (!el) return;
      el.scrollIntoView({ block: 'nearest' });
      scrolledTo.current = filters.move;
    }, 50);
    return () => clearTimeout(id);
  }, [filters.move, page, file, rows]);

  // 5-second Undo after a skip (single or bulk).
  const [undoIds, setUndoIds] = useState<string[]>([]);
  useEffect(() => {
    if (!undoIds.length) return;
    const t = setTimeout(() => setUndoIds([]), 5000);
    return () => clearTimeout(t);
  }, [undoIds]);
  const skip = (ids: string[]) => { p.skipMoves(ids); setUndoIds(ids); };

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
  const openRow = (id: string) => {
    fromClick.current = true;
    p.onFiltersChange({ ...filters, move: filters.move === id ? '' : id });
  };

  // Panel: the open move, its place in the filtered + sorted list, Prev/Next across pages, close back to the row.
  const openMove = filters.move ? rows.find((m) => m.id === filters.move) ?? file?.moves.find((m) => m.id === filters.move) : undefined;
  const openIndex = openMove ? rows.findIndex((m) => m.id === openMove.id) : -1;
  const goTo = (i: number) => p.onFiltersChange({ ...filters, move: rows[i].id });
  const closePanel = useCallback(() => {
    const id = filters.move;
    p.onFiltersChange({ ...filters, move: '' });
    setTimeout(() => document.getElementById(`row-${id}`)?.focus({ preventScroll: true }), 0);
  }, [filters, p]);
  useEffect(() => {
    if (!openMove) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === 'Escape' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) closePanel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openMove, closePanel]);

  const approveSelected = () => {
    const ok = chosen.filter((m) => !m.needs_signoff).map((m) => m.id);
    const held = chosen.length - ok.length;
    if (ok.length) p.approveMoves(ok);
    setNote(held ? `${held} need sign-off, review individually.` : '');
    setSelected(new Set(chosen.filter((m) => m.needs_signoff).map((m) => m.id)));
  };
  const skipSelected = () => {
    skip(chosen.map((m) => m.id));
    setNote('');
    setSelected(new Set());
  };

  const nf = new Intl.NumberFormat('en-IN');
  const showBulk = chosen.length > 0 || !!note || undoIds.length > 0;
  const bulkBody = (
    <>
      <span className="text-base">
            {chosen.length > 0 ? (
              <>
                <span className="font-bold">{chosen.length} selected</span> · {nf.format(chosen.reduce((s, m) => s + m.qty, 0))} pieces ·{' '}
                {inr(chosen.reduce((s, m) => s + m.value_inr, 0))}
              </>
            ) : null}
            {note && <span className="ml-2 font-semibold text-[#F4A27C]">{note}</span>}
            {undoIds.length > 0 && (
              <span className="ml-2" role="status">
                Skipped {undoIds.length} {undoIds.length === 1 ? 'move' : 'moves'}.{' '}
                <button type="button" className="font-semibold text-[#F4A27C] underline" onClick={() => { p.undo(undoIds); setUndoIds([]); }}>
                  Undo
                </button>
              </span>
            )}
          </span>
          {chosen.length > 0 && (
            <span className="flex w-full gap-2.5 sm:w-auto">
              <button type="button" onClick={skipSelected} className="h-12 flex-1 rounded-[10px] border-[1.5px] border-[#8A5A3C] px-4 font-semibold whitespace-nowrap sm:flex-none sm:px-5">
                Skip selected
              </button>
              <button type="button" onClick={approveSelected} className="h-12 flex-1 rounded-[10px] bg-cta px-4 font-semibold whitespace-nowrap text-white sm:flex-none sm:px-6">
                Approve selected
              </button>
            </span>
          )}
          <DeliveryNote className="w-full text-tint" />
    </>
  );

  const th = 'px-2.5 py-4 font-bold xl:px-3';

  return (
    // One move list for the row chips AND the panel (the panel sits outside the table), so both say the same thing.
    <AllMovesContext.Provider value={file?.moves ?? []}>
    {/* From 1872 px, line the page up with the left of the content area (keeping a 32 px gutter after the sidebar) so the
        480 px panel never covers it. Applied whether or not the panel is open, so opening it moves nothing.
        'left' (not transform) keeps the fixed panel fixed to the window. */}
    <div className="relative flex flex-col gap-8 min-[1872px]:left-[calc((1120px+240px-100vw)/2+32px)]">
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

      {file && <ActiveFilters file={file} filters={filters} onChange={p.onFiltersChange} />}

      {file && <ClosestBanner file={file} />}

      <Card padded={false} className="overflow-hidden">
        <div className="relative overflow-x-auto">
          {/* Phone and tablet: the table scrolls inside the card. From 1024 px it fits: columns share the width. */}
          <table className="w-full min-w-[860px] border-collapse text-[15px] lg:min-w-0">
            <thead>
              <tr className="bg-page text-left text-sm text-[#4A3A2E]">
                <th className={`${PIN} max-lg:left-0 max-lg:w-12 max-lg:max-w-12 max-lg:min-w-12 w-11 py-4 pr-2 pl-5 xl:pl-7`}>
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
                <th className={`${th} ${PIN} max-lg:left-12 max-lg:shadow-[6px_0_8px_-6px_rgba(81,29,0,0.22)]`}>Product</th>
                <th className={th}>From, to</th>
                <th className={th}>Pieces</th>
                <th className={th}>Days of stock</th>
                <th className={th}>Arrives</th>
                <th className="py-4 pr-5 pl-2.5 font-bold xl:pr-7">Why</th>
              </tr>
            </thead>
            <tbody>
              {p.loading && !file &&
                Array.from({ length: 8 }, (_, i) => (
                  <tr key={i} className="border-t border-[#F3E8D2]">
                    <td colSpan={7} className="px-7 py-5"><div className="h-10 animate-pulse rounded-lg bg-tint" /></td>
                  </tr>
                ))}
              {pageRows.map((m) => (
                <MoveRow
                  key={m.id}
                  move={m}
                  status={p.statusOf(m.id)}
                  selected={selected.has(m.id)}
                  open={filters.move === m.id}
                  onSelect={(on) => toggle(m.id, on)}
                  onToggle={() => openRow(m.id)}
                />
              ))}
            </tbody>
          </table>
        </div>

        {file && rows.length === 0 && (
          <div className="p-5 md:p-7">
            <EmptyState
              title="Nothing matches these filters"
              action={<Button variant="outline" onClick={() => p.onFiltersChange(EMPTY_FILTERS)}>Clear filters</Button>}
            />
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

      {showBulk && (
        <section
          className={`sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl bg-brown px-4 py-3 text-[#FFFBF2] shadow-[0_16px_40px_rgba(81,29,0,0.35)] md:bottom-6 md:px-6 md:py-4 ${
            openMove ? 'lg:mr-[496px]' : ''
          }`}
        >
          {bulkBody}
        </section>
      )}

      {openMove && file && (
        <MovePanel
          move={openMove}
          stores={file.stores}
          position={openIndex >= 0 ? { index: openIndex, total: rows.length } : null}
          status={p.statusOf(openMove.id)}
          onApprove={() => { p.approveMoves([openMove.id]); toggle(openMove.id, false); }}
          onSkip={() => { p.skipMoves([openMove.id]); toggle(openMove.id, false); }}
          onUndo={() => p.undo([openMove.id])}
          onPrev={openIndex > 0 ? () => goTo(openIndex - 1) : null}
          onNext={openIndex >= 0 && openIndex < rows.length - 1 ? () => goTo(openIndex + 1) : null}
          onClose={closePanel}
          bulk={chosen.length > 0 ? <div className="flex flex-col gap-2 rounded-xl bg-brown px-3 py-2 text-[#FFFBF2] lg:hidden">{bulkBody}</div> : undefined}
        />
      )}
    </div>
    </AllMovesContext.Provider>
  );
}

/** Chips for deep-link filters (?store=, ?problem=, ?sku=) so other screens can link in; each has a clear button. */
function ActiveFilters({ file, filters, onChange }: { file: MovesFile; filters: Filters; onChange: (f: Filters) => void }) {
  const chips: { key: keyof Filters; label: string }[] = [];
  if (filters.problem) {
    const pr = file.problems.find((x) => x.id === filters.problem);
    chips.push({ key: 'problem', label: `Problem ${filters.problem}${pr ? `: ${pr.title}` : ''}` });
  }
  if (filters.store) {
    const st = file.stores.find((x) => x.store_id === filters.store);
    chips.push({ key: 'store', label: `Store ${st ? `${st.city} · ` : ''}${filters.store}` });
  }
  if (filters.sku) chips.push({ key: 'sku', label: `Product ${filters.sku}` });
  // ?move= is shown by the detail panel itself, so it gets no chip (a chip above the table would shift the page).
  if (!chips.length) return null;
  return (
    <div className="-mt-4 flex flex-wrap items-center gap-2" aria-label="Active filters">
      {chips.map((c) => (
        <Chip key={c.key} tone="brown" className="max-w-full">
          <span className="truncate">{c.label}</span>
          <button
            type="button"
            aria-label={`Clear ${c.label}`}
            onClick={() => onChange({ ...filters, [c.key]: '', ...(c.key === 'move' ? {} : { move: '' }) })}
            className="-mr-1 ml-1 rounded-full px-1.5 leading-none hover:bg-white/20"
          >
            ×
          </button>
        </Chip>
      ))}
      {chips.length > 1 && (
        <button type="button" className="text-sm font-semibold text-cta underline" onClick={() => onChange(EMPTY_FILTERS)}>
          Clear all
        </button>
      )}
    </div>
  );
}
