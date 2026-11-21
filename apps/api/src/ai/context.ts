import type { Move, MovesFile } from '@sm/contract';

const MAX_CHAT_MOVES = 150;
const DEFAULT_CHAT_MOVES = 20;

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
  const locations = [...new Set([...m.stores.map((s) => s.store_id), ...m.moves.flatMap((mv) => [mv.from, mv.to])])];
  return {
    signoff_moves: {
      note: `complete list: all ${signoff.length} moves that need sign-off`,
      ...tally(signoff),
      list: signoff.map((mv) => ({ id: mv.id, from: mv.from, to: mv.to, style: mv.style_id, sku: mv.sku_id, pieces: mv.qty, value_inr: mv.value_inr })),
    },
    totals_by_type: Object.fromEntries(types.map((t) => [t, tally(m.moves.filter((mv) => mv.type === t))])),
    totals_by_trigger: Object.fromEntries(
      [...new Set(m.moves.map((mv) => mv.trigger))].map((t) => [t, tally(m.moves.filter((mv) => mv.trigger === t))]),
    ),
    store_flows: locations.map((id) => {
      const inc = m.moves.filter((mv) => mv.to === id);
      const out = m.moves.filter((mv) => mv.from === id);
      return {
        store: id,
        in_moves: inc.length, in_pieces: tally(inc).pieces,
        out_moves: out.length, out_pieces: tally(out).pieces,
      };
    }),
  };
}

/** Chat input: run + summary + problems + blocked + complete lists/totals + only the moves/stores/flags the question names. */
export function chatContext(m: MovesFile, question: string) {
  const q = question.toLowerCase();
  const has = (s: string | undefined) => !!s && q.includes(s.toLowerCase());
  const storeIds = new Set(
    m.stores.filter((s) => has(s.store_id) || has(s.city)).map((s) => s.store_id),
  );
  const movesHit = m.moves.filter(
    (mv) =>
      storeIds.has(mv.from) || storeIds.has(mv.to) || has(mv.from) || has(mv.to) ||
      has(mv.sku_id) || has(mv.style_id) || has(mv.style_name),
  );
  const named = movesHit.length > 0 || storeIds.size > 0;
  const pool = named ? movesHit : [...m.moves].sort((a, b) => b.priority - a.priority);
  const moves = pool.slice(0, named ? MAX_CHAT_MOVES : DEFAULT_CHAT_MOVES).map(compactMove);
  // Label every partial list with its true total, so the model can say "showing N of M".
  const moves_note = named
    ? moves.length < pool.length
      ? `PARTIAL: showing ${moves.length} of ${pool.length} moves that match the question (${m.moves.length} moves in the run)`
      : `all ${moves.length} moves that match the question (${m.moves.length} moves in the run)`
    : `PARTIAL: showing the top ${moves.length} of ${m.moves.length} moves by priority (question named no store, SKU or style)`;
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
