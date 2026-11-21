import type { Move, Problem } from '@sm/contract';
import type { ApprovalsApi, Decision } from '../../data/approvals';

/**
 * A problem's decision, wherever it was made (Today, All moves, Store, here).
 * Explicit problem status wins; otherwise a problem with moves is approved when every
 * move that does not need sign-off is approved, and skipped when every move is skipped.
 */
export function problemStatus(problem: Problem, moves: Move[], api: Pick<ApprovalsApi, 'statusOf' | 'problemStatusOf'>): Decision | undefined {
  const explicit = api.problemStatusOf(problem.id);
  if (explicit) return explicit;
  if (!moves.length) return undefined;
  if (moves.every((m) => api.statusOf(m.id) === 'skipped')) return 'skipped';
  const normal = moves.filter((m) => !m.needs_signoff);
  const toCheck = normal.length ? normal : moves;
  if (toCheck.every((m) => api.statusOf(m.id) === 'approved')) return 'approved';
  return undefined;
}

/** Store-level problem: about one store, many styles (no style in the subject). */
export function isStoreProblem(problem: Problem): boolean {
  return !!problem.subject.store_id && !problem.subject.style_id && !problem.subject.sku_id;
}
