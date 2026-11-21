import type { ReactNode } from 'react';
import type { AiCall } from '@sm/contract';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { Section } from '../components/Section';
import { Skeleton } from '../components/Skeleton';
import { useMovesFile } from '../data/useMovesFile';
import { num, timeShort } from '../lib/format';
import { CallsTable, HELD_LABEL } from '../features/ai-usage/CallsTable';
import { activityOf, LOG_LIMIT, NUMBER_RE, sampleCalls } from '../features/ai-usage/sample';
import { useAiLog } from '../features/ai-usage/useAiLog';

const STEPS = [
  ['Engine builds the list', 'Every move and number is worked out by fixed rules first.'],
  ['AI reads only that list', "It gets today's list and your question. Nothing else."],
  ['Numbers are matched', "Every number in the reply is looked up in today's list."],
  ['Wrong number? Stopped.', "If any number is not found, you see \"not in today's data\" instead."],
];
const SAFETY = [
  ["Sees only today's list", 'No outside data, no guessing'],
  ['Every number is matched', 'Any number not in the list stops the answer'],
  ['Says when it does not know', '"That is not in today\'s data"'],
  ['The key stays on our server', 'Calls go through MeshAPI, never from your browser'],
];

function SampleBadge({ children }: { children: ReactNode }) {
  return <Chip tone="warn">{children}</Chip>;
}

function Tile({ big, label, tone }: { big: string; label: string; tone?: 'ok' | 'held' }) {
  const bg = tone === 'ok' ? 'bg-ok-bg' : tone === 'held' ? 'bg-cta-bg' : 'bg-white shadow-card';
  const fg = tone === 'ok' ? 'text-ok' : tone === 'held' ? 'text-[#8A2C07]' : 'text-ink';
  return (
    <div className={`rounded-2xl p-6 ${bg}`}>
      <div className={`font-heading text-[38px] leading-none ${fg}`}>{big}</div>
      <div className="mt-2 text-base text-muted">{label}</div>
    </div>
  );
}

/** Answer text with every number the checker matched shown in green. */
function Highlighted({ text }: { text: string }) {
  const parts = text.split(new RegExp(`(${NUMBER_RE.source})`, 'g'));
  return (
    <p className="m-0 text-[17px] leading-[1.7]">
      {parts.map((p, i) =>
        i % 2 ? <span key={i} className="rounded-md bg-ok-bg px-1.5 py-0.5 font-bold text-ok">{p}</span> : p,
      )}
    </p>
  );
}

export default function AiUsagePage() {
  const { data, isSample: movesIsSample } = useMovesFile();
  const { log: liveLog, loading, error } = useAiLog(data?.run.run_id);

  // API fully down (moves file is the sample) or log has no rows yet -> sample rows + badge.
  // Moves file is live but the log call failed -> hide activity and table, keep the explanation.
  const hideActivity = error && !movesIsSample;
  const useSample = !hideActivity && !loading && (!liveLog || liveLog.calls.length === 0);
  // Tiles, example and table all come from one list of calls, never from the backend totals
  // (those count failed calls as briefings and answers).
  const calls: AiCall[] | null = useSample && data ? sampleCalls(data) : liveLog?.calls ?? null;

  const blockedTotal = data ? Object.values(data.blocked).reduce((a, b) => a + b, 0) : 0;
  const t = calls ? activityOf(calls) : null;
  const capped = (calls?.length ?? 0) >= LOG_LIMIT;
  // Newest shown answer that actually has numbers to highlight; the briefing first (Ask answers can be
  // numbered lists whose "1." "2." would light up as numbers), else any job.
  const withNumbers = calls?.filter((c) => c.result === 'SHOWN' && c.numbers_total > 0) ?? [];
  const example = withNumbers.find((c) => c.job === 'BRIEF') ?? withNumbers[0];

  return (
    <div className="flex flex-col gap-10 md:gap-12">
      <div className="flex flex-col gap-2.5">
        <h1 className="m-0 font-heading text-3xl font-normal text-ink md:text-[42px]">How AI is used here</h1>
        <p className="m-0 max-w-[720px] text-lg leading-normal text-muted">
          The rules engine decides every move and every number. AI only puts them into plain words and answers your
          questions. This page shows what it did today.
        </p>
      </div>

      <section className="grid gap-6 md:grid-cols-2">
        <Card className="flex flex-col gap-3.5">
          <div className="text-[13px] font-bold tracking-wider text-muted uppercase">The rules engine decides</div>
          <div className="font-heading text-[26px]">Every move, every number</div>
          {data ? (
            <div className="text-base leading-[1.8]">
              {num(data.summary.moves)} moves planned
              <br />
              {num(blockedTotal)} tempting moves stopped by the rules
              <br />
              {num(data.summary.violations)} rules broken
              <br />
              Same data in, same list out, every time
            </div>
          ) : (
            <Skeleton className="h-24 w-full" />
          )}
        </Card>
        <div className="flex flex-col gap-3.5 rounded-2xl bg-brown p-5 text-page shadow-card md:p-8">
          <div className="text-[13px] font-bold tracking-wider text-[#F4A27C] uppercase">AI explains</div>
          <div className="font-heading text-[26px]">Three jobs, nothing else</div>
          <div className="text-base leading-[1.8] text-tint">
            Writes the morning briefing
            <br />
            Answers questions in Ask
            <br />
            Explains stock counts that look wrong
          </div>
          <div className="border-t border-[#8A5A3C] pt-3.5 text-[15px] font-semibold">
            It never creates a number, changes a move or approves anything.
          </div>
        </div>
      </section>

      {!hideActivity && (
        <Section
          title="Today's AI activity"
          action={useSample && <SampleBadge>Sample figures until the first live run</SampleBadge>}
        >
          {loading || !t ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Tile
                big={num(t.briefs)}
                label={`morning ${t.briefs === 1 ? 'briefing' : 'briefings'} written${t.latest_brief_at ? `, latest ${timeShort(t.latest_brief_at)}` : ''}`}
              />
              <Tile big={num(t.questions)} label="questions answered in Ask" />
              <Tile
                tone="ok"
                big={`${num(t.numbers_found)} of ${num(t.numbers_total)}`}
                label="numbers in answers matched today's list"
              />
              <Tile
                tone="held"
                big={num(t.held_back)}
                label={`${t.held_back === 1 ? 'answer' : 'answers'} held back${t.top_held_reason ? ` (${HELD_LABEL[t.top_held_reason]})` : ''}`}
              />
            </div>
          )}
          {t && !loading && (
            <p className="m-0 text-[15px] text-muted">
              {t.failed > 0 && (
                <span className="font-semibold text-danger">
                  {num(t.failed)} {t.failed === 1 ? 'call' : 'calls'} failed (AI service error, nothing shown).{' '}
                </span>
              )}
              Counted from {capped ? `the last ${num(calls!.length)}` : `all ${num(calls!.length)}`} AI calls for this
              run. Failed calls are not counted as briefings or answers.
            </p>
          )}
        </Section>
      )}

      <Section title="How every answer is checked">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, text], i) => (
            <Card key={title} className="flex flex-col gap-2.5 !p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-tint font-heading text-xl text-brown">
                {i + 1}
              </span>
              <div className="text-[17px] font-bold">{title}</div>
              <div className="text-[15px] leading-normal text-muted">{text}</div>
            </Card>
          ))}
        </div>
        {example && (
          <Card className="flex flex-col gap-3.5">
            <div className="text-sm text-muted">{useSample ? 'Example (sample)' : 'Example from today'}</div>
            <div className="text-[17px] font-bold">
              {example.job === 'BRIEF' ? 'Morning briefing' : example.input_summary}
            </div>
            <Highlighted text={example.output} />
            <div className="text-[15px] font-semibold text-ok">
              {example.numbers_found} of {example.numbers_total} numbers found in today's list. Shown to you.
            </div>
          </Card>
        )}
      </Section>

      {!hideActivity && (
        <Section
          title="Recent AI calls"
          explainer="Tap a row to see the full answer."
          action={useSample && <SampleBadge>Sample rows</SampleBadge>}
        >
          {loading || !calls ? <Skeleton className="h-48 w-full" /> : <CallsTable calls={calls.slice(0, 20)} />}
        </Section>
      )}

      <section className="flex flex-col gap-4 rounded-[20px] bg-ok-bg p-6 text-[#123D2E] md:px-10 md:py-9">
        <h2 className="m-0 font-heading text-[26px] font-normal">Safety rules for the AI</h2>
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 text-base leading-normal sm:grid-cols-2 lg:grid-cols-4">
          {SAFETY.map(([title, text]) => (
            <div key={title}>
              <div className="font-bold">{title}</div>
              {text}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
