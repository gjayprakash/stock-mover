import { Link } from 'react-router-dom';
import type { Move, Problem } from '@sm/contract';

const RULES: { key: keyof Move['checks']; text: string }[] = [
  { key: 'capacity', text: 'No store goes over its space limit' },
  { key: 'min_display', text: 'Display minimums are kept' },
  { key: 'flagship', text: 'Flagships keep their top-20 styles' },
  { key: 'in_transit', text: 'Nothing already on a truck is sent twice' },
  { key: 'donor_cover_30', text: 'A giving store keeps 30 days of stock' },
];

function questions(problem: Problem, moves: Move[]): string[] {
  const subject = problem.subject.style_id ?? problem.subject.sku_id ?? problem.subject.store_id ?? 'this item';
  const q = [`Why is ${subject} a problem today?`];
  if (moves.length) q.push(`Why do these stores get ${subject} first?`);
  if (moves.some((m) => m.from === 'WH-KOL')) q.push(`Should we wait for the next warehouse delivery of ${subject}?`);
  else if (!moves.length) q.push(`What should the store check when it recounts ${subject}?`);
  return q;
}

/** Green checks card for this problem's entries, plus question chips that open Ask. */
export function ChecksAndQuestions({ problem, moves }: { problem: Problem; moves: Move[] }) {
  const leads = [...new Set(moves.map((m) => m.lead_time_days))].sort((a, b) => a - b);
  const allPass = moves.every((m) => RULES.every((r) => m.checks[r.key]));
  return (
    <section className="flex flex-wrap gap-6">
      {moves.length > 0 && (
        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-3 rounded-[18px] bg-ok-bg p-6 text-[#123D2E] md:p-8">
          <h2 className="m-0 font-heading text-2xl font-normal">
            {allPass ? `All ${moves.length} ${moves.length === 1 ? 'entry' : 'entries'} passed every check` : 'Rule checks'}
          </h2>
          <ul className="m-0 list-none p-0 text-base leading-[1.8]">
            {RULES.map((r) => {
              const ok = moves.filter((m) => m.checks[r.key]).length;
              return <li key={r.key}>{ok === moves.length ? '✓' : `${ok} of ${moves.length}:`} {r.text}</li>;
            })}
            <li>✓ Travel time is counted: {leads.join(', ')} {leads.length === 1 && leads[0] === 1 ? 'day' : 'days'}</li>
          </ul>
        </div>
      )}
      <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-3.5 rounded-[18px] bg-white p-6 shadow-card md:p-8">
        <h2 className="m-0 font-heading text-2xl font-normal">Questions about this problem?</h2>
        <div className="flex flex-wrap gap-2">
          {questions(problem, moves).map((q) => (
            <Link
              key={q}
              to={`/ask?q=${encodeURIComponent(q)}`}
              className="flex min-h-11 items-center rounded-full bg-tint px-4 text-[15px] font-medium text-brown no-underline hover:bg-cta-bg"
            >
              {q}
            </Link>
          ))}
        </div>
        <Link
          to="/ask"
          className="flex min-h-[52px] items-center justify-center rounded-xl border-[1.5px] border-brown font-semibold text-brown no-underline hover:bg-tint"
        >
          Ask your own question
        </Link>
      </div>
    </section>
  );
}
