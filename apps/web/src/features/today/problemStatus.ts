import type { Move, Problem } from '@sm/contract';
import type { ApprovalsApi, Decision } from '../../data/approvals';

/**
 * A problem's decision, also counting approvals made on other screens.
 * Explicit problem status wins. Otherwise, with at least one move: approved when every move
 * that does not need sign-off is approved (sign-off moves stay as "Review N"); skipped when every move is skipped.
 */
export function problemStatus(problem: Problem, byId: Map<string, Move>, ap: ApprovalsApi): Decision | undefined {
  const explicit = ap.problemStatusOf(problem.id);
  if (explicit) return explicit;
  const ids = problem.move_ids;
  if (ids.length === 0) return undefined;
  if (ids.every((id) => ap.statusOf(id) === 'skipped')) return 'skipped';
  const plain = ids.filter((id) => !byId.get(id)?.needs_signoff);
  if (plain.length > 0 && plain.every((id) => ap.statusOf(id) === 'approved')) return 'approved';
  // Only sign-off moves: approved once all of them are approved.
  if (plain.length === 0 && ids.every((id) => ap.statusOf(id) === 'approved')) return 'approved';
  return undefined;
}

export function movesById(moves: Move[]): Map<string, Move> {
  return new Map(moves.map((m) => [m.id, m]));
}
