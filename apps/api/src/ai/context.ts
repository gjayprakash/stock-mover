import type { Move, MovesFile } from '@sm/contract';
import { recognise, isEmpty, type About } from './entities';

const MAX_CHAT_MOVES = 20; // full detail; every matching move is also a compact row in focus and move_index
const WH = 'WH-KOL';
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
      note: 'per place, already added up and listed: in_ids / out_ids = every move id in or out, split by warehouse or store at the other end; in_from = [source, moves, pieces], out_to = [destination, moves, pieces], biggest first; copy these, never add moves up yourself',
      list: storeFlows(m).map((f) => ({
        store: f.store,
        in_moves: f.in_moves, in_pieces: f.in_pieces, in_from: f.in_from.map((p) => [p.place, p.moves, p.pieces]),
        in_by_category: f.in_by_category, arrive_between: f.arrive_between,
        out_moves: f.out_moves, out_pieces: f.out_pieces, out_to: f.out_to.map((p) => [p.place, p.moves, p.pieces]),
        out_by_category: f.out_by_category,
        in_ids: f.in_ids, out_ids: f.out_ids,
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
  // Move ids, split by whether the other end is the warehouse or a store (#18: copy a list, don't filter 280 rows).
  in_ids: { from_warehouse: string[]; from_stores: string[] };
  out_ids: { to_warehouse: string[]; to_stores: string[] };
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
      in_ids: { from_warehouse: inc.filter((mv) => mv.from === WH).map((mv) => mv.id), from_stores: inc.filter((mv) => mv.from !== WH).map((mv) => mv.id) },
      out_ids: { to_warehouse: out.filter((mv) => mv.to === WH).map((mv) => mv.id), to_stores: out.filter((mv) => mv.to !== WH).map((mv) => mv.id) },
    };
  });
}

/**
 * Full detail for every tagged or recognised entity (#13), so vague questions ("what is not going right?")
 * are answered from the data for that entity.
 */
export function focusOn(m: MovesFile, about: About) {
  const flows = new Map(storeFlows(m).map((f) => [f.store, f]));
  const problemsOf = (pred: (p: MovesFile['problems'][number]) => boolean) =>
    m.problems.filter(pred).map(({ id, tag, title, seen, fix }) => ({ id, tag, title, seen, fix }));
  const row = (mv: Move) => [mv.id, mv.type, mv.trigger, mv.from, mv.to, mv.sku_id, mv.qty, mv.value_inr, mv.arrives_on, mv.needs_signoff ? 1 : 0];
  const ofProduct = (id: string) => (mv: Move) => mv.sku_id === id || mv.style_id === id;
  return {
    note: 'The question is about these stores, products and moves (tagged or typed), even if it is vague or misspelt. Answer from here.',
    moves: about.moves.map((id) => {
      const mv = m.moves.find((x) => x.id === id)!;
      return {
        move: mv,
        problems: problemsOf((p) => p.move_ids.includes(id)),
        // Flags for its product anywhere, and flags for the same style at its two stores.
        flags: m.flags.filter((f) => f.sku_id === mv.sku_id ||
          ((f.store_id === mv.from || f.store_id === mv.to) && f.sku_id.startsWith(mv.style_id + '-'))),
      };
    }),
    stores: about.stores.map((id) => ({
      store: m.stores.find((s) => s.store_id === id) ?? { store_id: id },
      flow: flows.get(id) ?? null,
      // WH-KOL is on most moves: its rows are already in move_index, so they are not repeated here.
      moves: id === 'WH-KOL'
        ? 'every move_index row with from or to WH-KOL'
        : { cols: 'as move_index', rows: m.moves.filter((mv) => mv.from === id || mv.to === id).map(row) },
      problems: problemsOf((p) => p.subject.store_id === id || p.move_ids.some((x) => { const mv = m.moves.find((y) => y.id === x); return mv?.from === id || mv?.to === id; })),
      flags: m.flags.filter((f) => f.store_id === id),
    })),
    products: about.skus.map((id) => ({
      product: id,
      moves: { cols: 'as move_index', rows: m.moves.filter(ofProduct(id)).map(row) },
      problems: problemsOf((p) => p.subject.sku_id === id || p.subject.style_id === id || (!!p.subject.sku_id && p.subject.sku_id.startsWith(id + '-'))),
      flags: m.flags.filter((f) => f.sku_id === id || f.sku_id.startsWith(id + '-')),
    })),
  };
}

/** Chat input: run + summary + problems + blocked + complete lists/totals + full detail for the entities in `about`. */
export function chatContext(m: MovesFile, question: string, about: About = recognise(m, question)) {
  const storeIds = new Set(about.stores.filter((id) => id !== 'WH-KOL')); // WH-KOL alone would match most moves
  const moveIds = new Set(about.moves);
  const productIds = new Set(about.skus);
  const movesHit = m.moves.filter(
    (mv) => moveIds.has(mv.id) || storeIds.has(mv.from) || storeIds.has(mv.to) || productIds.has(mv.sku_id) || productIds.has(mv.style_id),
  );
  // Moves named by id go first so the cap never drops them.
  movesHit.sort((a, b) => Number(moveIds.has(b.id)) - Number(moveIds.has(a.id)));
  const named = movesHit.length > 0;
  const pool = named ? movesHit : [...m.moves].sort((a, b) => b.priority - a.priority);
  const moves = pool.slice(0, named ? Math.max(MAX_CHAT_MOVES, moveIds.size) : DEFAULT_CHAT_MOVES).map(compactMove);
  // Label every partial list with its true total, so the model can say "showing N of M".
  const moves_note = named
    ? moves.length < pool.length
      ? `full detail for ${moves.length} of ${pool.length} moves that match the question; move_index has all ${m.moves.length}`
      : `full detail for all ${moves.length} moves that match the question; move_index has all ${m.moves.length}`
    : `full detail for the top ${moves.length} of ${m.moves.length} moves by priority; move_index has all ${m.moves.length}`;
  return {
    ...(isEmpty(about) ? {} : { focus: focusOn(m, about) }),
    run: { run_id: m.run.run_id, as_of: m.run.as_of, generated_at: m.run.generated_at, next_run_at: m.run.next_run_at },
    summary: m.summary,
    problems: m.problems.map(({ id, kind, tag, title, seen, fix, subject, move_ids, impact_inr, needs_signoff_count }) => ({
      id, kind, tag, title, seen, fix, subject, move_count: move_ids.length, move_ids, impact_inr, needs_signoff_count,
    })),
    blocked: m.blocked,
    ...completeLists(m),
    moves_note,
    moves,
  };
}
