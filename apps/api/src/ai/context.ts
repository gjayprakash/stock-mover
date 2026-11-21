import type { Move, MovesFile } from '@sm/contract';

const MAX_CHAT_MOVES = 150;
const DEFAULT_CHAT_MOVES = 8; // full detail only; move_index already lists every move

const problemLines = (m: MovesFile) => m.problems.map(({ tag, title, seen, fix }) => ({ tag, title, seen, fix }));

/** Brief input: summary + problems + blocked, no raw rows. */
export function briefContext(m: MovesFile) {
  return { as_of: m.run.as_of, summary: m.summary, problems: problemLines(m), blocked: m.blocked };
}

const compactMove = (mv: Move) => {
  const { checks: _checks, ...rest } = mv;
  return rest;
};

type Tally = { moves: number; pieces: number; value_inr: number };
const tally = (mvs: Move[]): Tally => ({
  moves: mvs.length,
  pieces: mvs.reduce((t, mv) => t + mv.qty, 0),
  value_inr: mvs.reduce((t, mv) => t + mv.value_inr, 0),
});

/**
 * Complete lists and totals, always sent whatever the question, so "which" / "how many" questions
 * are answered from the whole run and not from the partial `moves` list (issue #18: a sign-off
 * question was answered with 6 of 11 moves). Entries are compact to keep the prompt small.
 */
function completeLists(m: MovesFile) {
  const signoff = m.moves.filter((mv) => mv.needs_signoff);
  const types = [...new Set(m.moves.map((mv) => mv.type))];
  // One short row per move (column names given once, style names once per style) so every
  // "which / list / when" question is answered from all moves, not a top-N slice (#18).
  const cols = ['id', 'type', 'trigger', 'from', 'to', 'sku', 'pieces', 'value_inr', 'arrives_on', 'needs_signoff'];
  return {
    move_index: {
      note: `COMPLETE list of all ${m.moves.length} moves, one row each; columns as in "cols"; sku = style id + size, style names in "style_names"`,
      cols,
      rows: m.moves.map((mv) => [mv.id, mv.type, mv.trigger, mv.from, mv.to, mv.sku_id, mv.qty, mv.value_inr, mv.arrives_on, mv.needs_signoff ? 1 : 0]),
      style_names: Object.fromEntries(m.moves.map((mv) => [mv.style_id, mv.style_name])),
    },
    signoff_moves: {
      note: `complete list: all ${signoff.length} moves that need sign-off`,
      ...tally(signoff),
      list: signoff.map((mv) => ({ id: mv.id, from: mv.from, to: mv.to, style: mv.style_id, sku: mv.sku_id, pieces: mv.qty, value_inr: mv.value_inr })),
    },
    totals_by_type: Object.fromEntries(types.map((t) => [t, tally(m.moves.filter((mv) => mv.type === t))])),
    totals_by_trigger: Object.fromEntries(
      [...new Set(m.moves.map((mv) => mv.trigger))].map((t) => [t, tally(m.moves.filter((mv) => mv.trigger === t))]),
    ),
    store_flows: {
      note: 'per place, already added up: in_from = [source, moves, pieces], out_to = [destination, moves, pieces], biggest first; copy these, never add moves up yourself',
      list: storeFlows(m).map((f) => ({
        store: f.store,
        in_moves: f.in_moves, in_pieces: f.in_pieces, in_from: f.in_from.map((p) => [p.place, p.moves, p.pieces]),
        in_by_category: f.in_by_category, arrive_between: f.arrive_between,
        out_moves: f.out_moves, out_pieces: f.out_pieces, out_to: f.out_to.map((p) => [p.place, p.moves, p.pieces]),
        out_by_category: f.out_by_category,
      })),
    },
  };
}

export type PlaceShare = { place: string; moves: number; pieces: number };
export type StoreFlow = {
  store: string;
  in_moves: number; in_pieces: number; in_from: PlaceShare[]; in_by_category: Record<string, number>;
  arrive_between: [string, string] | null;
  out_moves: number; out_pieces: number; out_to: PlaceShare[]; out_by_category: Record<string, number>;
};

/**
 * Incoming / outgoing totals per store and WH-KOL, broken down by source / destination and category (#18).
 * The adding is done here, so the model copies sums instead of adding 31 moves itself (it dropped one).
 * Also used by the grounding check to verify that a listed breakdown is complete.
 */
export function storeFlows(m: MovesFile): StoreFlow[] {
  const ids = [...new Set([...m.stores.map((s) => s.store_id), ...m.moves.flatMap((mv) => [mv.from, mv.to])])];
  const share = (mvs: Move[], key: 'from' | 'to'): PlaceShare[] => {
    const by = new Map<string, PlaceShare>();
    for (const mv of mvs) {
      const p = by.get(mv[key]) ?? { place: mv[key], moves: 0, pieces: 0 };
      p.moves++;
      p.pieces += mv.qty;
      by.set(mv[key], p);
    }
    return [...by.values()].sort((a, b) => b.pieces - a.pieces || a.place.localeCompare(b.place));
  };
  const byCat = (mvs: Move[]) => {
    const out: Record<string, number> = {};
    for (const mv of mvs) out[mv.category] = (out[mv.category] ?? 0) + mv.qty;
    return out;
  };
  return ids.map((id) => {
    const inc = m.moves.filter((mv) => mv.to === id);
    const out = m.moves.filter((mv) => mv.from === id);
    const dates = inc.map((mv) => mv.arrives_on).sort();
    return {
      store: id,
      in_moves: inc.length, in_pieces: tally(inc).pieces, in_from: share(inc, 'from'), in_by_category: byCat(inc),
      arrive_between: dates.length ? [dates[0], dates[dates.length - 1]] : null,
      out_moves: out.length, out_pieces: tally(out).pieces, out_to: share(out, 'to'), out_by_category: byCat(out),
    };
  });
}

/** Chat input: run + summary + problems + blocked + complete lists/totals + only the moves/stores/flags the question names. */
export function chatContext(m: MovesFile, question: string) {
  const q = question.toLowerCase();
  const has = (s: string | undefined) => !!s && q.includes(s.toLowerCase());
  const storeIds = new Set(
    m.stores.filter((s) => has(s.store_id) || has(s.city)).map((s) => s.store_id),
  );
  const moveIds = new Set((question.toUpperCase().match(/\bM\d{4}\b/g) ?? []));
  const movesHit = m.moves.filter(
    (mv) =>
      moveIds.has(mv.id) ||
      storeIds.has(mv.from) || storeIds.has(mv.to) || has(mv.from) || has(mv.to) ||
      has(mv.sku_id) || has(mv.style_id) || has(mv.style_name),
  );
  // Moves named by id go first so the cap never drops them.
  movesHit.sort((a, b) => Number(moveIds.has(b.id)) - Number(moveIds.has(a.id)));
  const named = movesHit.length > 0 || storeIds.size > 0;
  const pool = named ? movesHit : [...m.moves].sort((a, b) => b.priority - a.priority);
  const moves = pool.slice(0, named ? MAX_CHAT_MOVES : DEFAULT_CHAT_MOVES).map(compactMove);
  // Label every partial list with its true total, so the model can say "showing N of M".
  const moves_note = named
    ? moves.length < pool.length
      ? `full detail for ${moves.length} of ${pool.length} moves that match the question; move_index has all ${m.moves.length}`
      : `full detail for all ${moves.length} moves that match the question; move_index has all ${m.moves.length}`
    : `full detail for the top ${moves.length} of ${m.moves.length} moves by priority; move_index has all ${m.moves.length}`;
  const flags = m.flags.filter((f) => storeIds.has(f.store_id) || has(f.store_id) || has(f.sku_id) || has(f.sku_id.split('-').slice(0, 2).join('-')));
  const stores = m.stores.filter((s) => storeIds.has(s.store_id));
  return {
    run: { run_id: m.run.run_id, as_of: m.run.as_of, generated_at: m.run.generated_at, next_run_at: m.run.next_run_at },
    summary: m.summary,
    problems: m.problems.map(({ id, kind, tag, title, seen, fix, subject, move_ids, impact_inr, needs_signoff_count }) => ({
      id, kind, tag, title, seen, fix, subject, move_count: move_ids.length, move_ids, impact_inr, needs_signoff_count,
    })),
    blocked: m.blocked,
    ...completeLists(m),
    moves_note,
    moves,
    stores,
    flags,
  };
}
