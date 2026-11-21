import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Move, Problem } from '@sm/contract';
import { useMovesFile } from './useMovesFile';
import { useAuth } from '../features/auth/auth';

export type Decision = 'approved' | 'skipped';
export type ApprovalsState = {
  moves: Record<string, Decision>;
  problems: Record<string, Decision>;
};

/** What happened when an approved store-to-store move was turned into a delivery (super admin only). */
export type Delivery = 'sending' | 'sent' | { error: string };

export type ApprovalsApi = {
  state: ApprovalsState;
  approveMoves: (ids: string[]) => void;
  skipMoves: (ids: string[]) => void;
  /** Clears the decision for these move ids and/or problem ids. */
  undo: (ids: string[]) => void;
  /** Approves the problem's moves except needs_signoff ones; returns the move ids still waiting for sign-off. */
  approveProblem: (problem: Problem, moves: Move[]) => string[];
  skipProblem: (id: string) => void;
  statusOf: (moveId: string) => Decision | undefined;
  problemStatusOf: (problemId: string) => Decision | undefined;
  /** Approved moves from the current moves file, in file order. */
  approvedMoves: () => Move[];
  counts: { approved: number; skipped: number; total: number };
  /** Delivery state of a store-to-store move approved in this visit; undefined when not sent from this page load. */
  deliveryOf: (moveId: string) => Delivery | undefined;
  /** Creates the delivery for an approved store-to-store move (safe to repeat: one delivery per move). */
  sendDelivery: (moveId: string) => void;
};

const EMPTY: ApprovalsState = { moves: {}, problems: {} };
/** User part is the signed-in user id, or "anon" when sign-in is off, so two users on one browser never share approvals. */
const keyFor = (user: string, runId: string) => `sm:${user}:${runId}`;

function load(key: string): ApprovalsState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return EMPTY;
    const v = JSON.parse(raw) as Partial<ApprovalsState>;
    return { moves: v.moves ?? {}, problems: v.problems ?? {} };
  } catch {
    return EMPTY;
  }
}
function save(key: string, state: ApprovalsState) {
  try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* storage blocked: keep in memory */ }
}

const Ctx = createContext<ApprovalsApi | null>(null);

/** Approvals live in localStorage per run_id; a new run_id starts empty. Must sit inside <MovesFileProvider>. */
export function ApprovalsProvider({ children }: { children: ReactNode }) {
  const { data } = useMovesFile();
  const { me, isAdmin } = useAuth();
  const key = data ? keyFor(me?.id ?? 'anon', data.run.run_id) : null;
  const [store, setStore] = useState<{ key: string | null; state: ApprovalsState }>({ key: null, state: EMPTY });

  // Reload whenever the run changes (reset = new key has nothing stored).
  useEffect(() => {
    if (key) setStore({ key, state: load(key) });
  }, [key]);

  const state = store.key === key ? store.state : EMPTY;

  const update = useCallback((fn: (s: ApprovalsState) => ApprovalsState) => {
    setStore((cur) => {
      if (!cur.key) return cur;
      const next = fn(cur.state);
      save(cur.key, next);
      return { key: cur.key, state: next };
    });
  }, []);

  const setMoves = useCallback(
    (ids: string[], d: Decision) => update((s) => {
      const moves = { ...s.moves };
      for (const id of ids) moves[id] = d;
      return { ...s, moves };
    }),
    [update],
  );

  // A super admin approving a store-to-store move also creates its delivery: the giving store sees it under
  // Going out and hands it to a driver, the receiving store under Coming in. Warehouse moves: not tracked yet.
  const [deliveries, setDeliveries] = useState<Record<string, Delivery>>({});
  useEffect(() => setDeliveries({}), [key]);
  const send = useCallback((ids: string[]) => {
    if (!isAdmin || !data) return;
    const byId = new Map(data.moves.map((m) => [m.id, m]));
    const mark = (id: string, d: Delivery) => setDeliveries((cur) => ({ ...cur, [id]: d }));
    for (const id of ids) {
      if (byId.get(id)?.type !== 'STORE_TO_STORE') continue;
      mark(id, 'sending');
      fetch('/api/requests/from-move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ move_id: id }) })
        .then(async (r) => {
          if (r.ok) return mark(id, 'sent');
          const j = (await r.json().catch(() => null)) as { error?: string } | null;
          mark(id, { error: j?.error ?? 'The delivery could not be created' });
        })
        .catch(() => mark(id, { error: "Can't reach Stock Mover. Try again." }));
    }
  }, [isAdmin, data]);

  const api = useMemo<ApprovalsApi>(() => {
    const moves = data?.moves ?? [];
    const approved = Object.values(state.moves).filter((d) => d === 'approved').length;
    const skipped = Object.values(state.moves).filter((d) => d === 'skipped').length;
    return {
      state,
      approveMoves: (ids) => { setMoves(ids, 'approved'); send(ids); },
      skipMoves: (ids) => setMoves(ids, 'skipped'),
      undo: (ids) => update((s) => {
        const m = { ...s.moves };
        const p = { ...s.problems };
        for (const id of ids) { delete m[id]; delete p[id]; }
        return { moves: m, problems: p };
      }),
      approveProblem: (problem, all) => {
        const byId = new Map(all.map((m) => [m.id, m]));
        const ok: string[] = [];
        const pending: string[] = [];
        for (const id of problem.move_ids) (byId.get(id)?.needs_signoff ? pending : ok).push(id);
        update((s) => {
          const m = { ...s.moves };
          for (const id of ok) m[id] = 'approved';
          return { moves: m, problems: { ...s.problems, [problem.id]: 'approved' } };
        });
        send(ok);
        return pending;
      },
      skipProblem: (id) => update((s) => {
        const problem = data?.problems.find((p) => p.id === id);
        const m = { ...s.moves };
        for (const mid of problem?.move_ids ?? []) if (m[mid] !== 'approved') m[mid] = 'skipped';
        return { moves: m, problems: { ...s.problems, [id]: 'skipped' } };
      }),
      statusOf: (id) => state.moves[id],
      problemStatusOf: (id) => state.problems[id],
      approvedMoves: () => moves.filter((m) => state.moves[m.id] === 'approved'),
      counts: { approved, skipped, total: moves.length },
      deliveryOf: (id) => deliveries[id],
      sendDelivery: (id) => send([id]),
    };
  }, [data, state, setMoves, update, deliveries, send]);

  // Dev-only handle for the manual check in devtools: window.smApprovals.approveMoves([...])
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { smApprovals: ApprovalsApi }).smApprovals = api;
  }, [api]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useApprovals(): ApprovalsApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApprovals must be used inside <ApprovalsProvider>');
  return v;
}
