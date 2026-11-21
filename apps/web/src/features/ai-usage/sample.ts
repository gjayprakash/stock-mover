import type { AiCall, MovesFile } from '@sm/contract';

/** Same shape as GET /api/ai/log (apps/api/src/ai/ai-log.service.ts list()). */
export type AiLogTotals = {
  briefs: number; questions: number; numbers_found: number; numbers_total: number;
  held_back: number; top_held_reason: AiCall['held_reason'] | null;
};
export type AiLog = { calls: AiCall[]; totals: AiLogTotals };

/** Numbers as the checker sees them: "14", "1,31,200", "0.38". Digits inside IDs (BLR-04) are skipped. */
export const NUMBER_RE = /(?<![\w-])\d(?:[\d,]*\d)?(?:\.\d+)?/g;
const countNumbers = (s: string) => (s.match(NUMBER_RE) ?? []).length;

/** Mirrors the backend totals so sample tiles use the same maths as real ones. */
export function totalsOf(calls: AiCall[]): AiLogTotals {
  const held = calls.filter((c) => c.result === 'HELD_BACK');
  const reasons = new Map<string, number>();
  held.forEach((c) => c.held_reason && reasons.set(c.held_reason, (reasons.get(c.held_reason) ?? 0) + 1));
  const top = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    briefs: calls.filter((c) => c.job === 'BRIEF').length,
    questions: calls.filter((c) => c.job === 'ASK').length,
    numbers_found: calls.reduce((t, c) => t + c.numbers_found, 0),
    numbers_total: calls.reduce((t, c) => t + c.numbers_total, 0),
    held_back: held.length,
    top_held_reason: (top?.[0] as AiCall['held_reason']) ?? null,
  };
}

/**
 * Sample rows shown until the log has real calls. Their text is lifted from the moves file
 * (problem titles, move reasons), so every number in them is a real engine number.
 */
export function sampleCalls(file: MovesFile): AiCall[] {
  const runId = file.run.run_id;
  const base = new Date(file.run.generated_at).getTime();
  const at = (min: number) => new Date(base + min * 60_000).toISOString();
  const row = (min: number, job: AiCall['job'], input: string, output: string, extra: Partial<AiCall> = {}): AiCall => {
    const n = countNumbers(output);
    return {
      id: `sample-${min}`, run_id: runId, at: at(min), job, input_summary: input, output,
      numbers_found: n, numbers_total: n, result: 'SHOWN', model: 'sample', latency_ms: 0, ...extra,
    };
  };

  const calls: AiCall[] = [];
  const brief = file.problems.slice(0, 3).map((p) => p.title).join(' ');
  if (brief) calls.push(row(1, 'BRIEF', "Write today's morning briefing", brief));
  file.moves.slice(0, 3).forEach((m, i) =>
    calls.push(row(190 + i * 11, 'ASK', `Why move ${m.sku_id} to ${m.to}?`, m.reason)),
  );
  const flag = file.flags.find((f) => f.kind === 'DATA_COUNT_MISMATCH');
  if (flag) calls.push(row(230, 'DATA_FLAG', `Explain the ${flag.sku_id} count at ${flag.store_id}`, flag.note));
  calls.push(row(244, 'ASK', 'What will Diwali sales be this year?', "That is not in today's data. Stock Mover does not forecast sales.", {
    numbers_found: 0, numbers_total: 0, result: 'HELD_BACK', held_reason: 'FORECAST_REQUEST',
  }));
  return calls.reverse(); // newest first, like the API
}
