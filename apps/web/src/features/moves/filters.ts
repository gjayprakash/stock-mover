import type { Move, MoveType, MovesFile } from '@sm/contract';

export type Kind = 'all' | MoveType;
export type Filters = { kind: Kind; store: string; q: string; signoff: boolean; problem: string; move: string };
export type ApprovalStatus = 'approved' | 'skipped' | undefined;

const KINDS: MoveType[] = ['WH_TO_STORE', 'STORE_TO_STORE', 'PULL_BACK'];
export const URL_KIND: Record<MoveType, string> = { WH_TO_STORE: 'wh', STORE_TO_STORE: 'ss', PULL_BACK: 'pb' };

/** URL <-> filters. Keys: ?kind=wh|ss|pb&store=&q=&signoff=1&problem=&move= */
export function readFilters(p: URLSearchParams): Filters {
  const k = p.get('kind');
  const kind = (KINDS.find((t) => URL_KIND[t] === k || t === k) ?? 'all') as Kind;
  return {
    kind,
    store: p.get('store') ?? '',
    q: p.get('q') ?? '',
    signoff: p.get('signoff') === '1',
    problem: p.get('problem') ?? '',
    move: p.get('move') ?? '',
  };
}

export function writeFilters(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.kind !== 'all') p.set('kind', URL_KIND[f.kind]);
  if (f.store) p.set('store', f.store);
  if (f.q) p.set('q', f.q);
  if (f.signoff) p.set('signoff', '1');
  if (f.problem) p.set('problem', f.problem);
  if (f.move) p.set('move', f.move);
  return p;
}

export const EMPTY_FILTERS: Filters = { kind: 'all', store: '', q: '', signoff: false, problem: '', move: '' };

/** Sorted by priority desc, then filtered. All client-side. */
export function applyFilters(file: MovesFile, f: Filters): Move[] {
  const city = new Map(file.stores.map((s) => [s.store_id, s.city.toLowerCase()]));
  const inProblem = f.problem ? new Set(file.problems.find((p) => p.id === f.problem)?.move_ids ?? []) : null;
  const q = f.q.trim().toLowerCase();
  return file.moves
    .filter((m) => {
      if (f.kind !== 'all' && m.type !== f.kind) return false;
      if (f.store && m.from !== f.store && m.to !== f.store) return false;
      if (f.signoff && !m.needs_signoff) return false;
      if (inProblem && !inProblem.has(m.id)) return false;
      if (q) {
        const hay = [m.style_name, m.sku_id, m.style_id, m.size, m.category, m.from, m.to, city.get(m.from) ?? '', city.get(m.to) ?? '', m.id]
          .join(' ')
          .toLowerCase();
        if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      return true;
    })
    .sort((a, b) => b.priority - a.priority);
}
