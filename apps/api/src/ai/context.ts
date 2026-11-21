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

/** Chat input: run + summary + problems + blocked + only the moves/stores/flags the question names. */
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
  const moves = (named ? movesHit : [...m.moves].sort((a, b) => b.priority - a.priority).slice(0, DEFAULT_CHAT_MOVES))
    .slice(0, MAX_CHAT_MOVES)
    .map(compactMove);
  const flags = m.flags.filter((f) => storeIds.has(f.store_id) || has(f.store_id) || has(f.sku_id) || has(f.sku_id.split('-').slice(0, 2).join('-')));
  const stores = m.stores.filter((s) => storeIds.has(s.store_id));
  return {
    run: { run_id: m.run.run_id, as_of: m.run.as_of, generated_at: m.run.generated_at, next_run_at: m.run.next_run_at },
    summary: m.summary,
    problems: m.problems.map(({ id, kind, tag, title, seen, fix, subject, move_ids, impact_inr }) => ({ id, kind, tag, title, seen, fix, subject, move_ids, impact_inr })),
    blocked: m.blocked,
    moves,
    moves_note: named ? 'moves matching the question' : `top ${moves.length} moves by priority (question named no store, SKU or style)`,
    stores,
    flags,
  };
}
