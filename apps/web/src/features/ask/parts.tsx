import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import type { MovesFile } from '@sm/contract';
import type { ChatFinal, ChatStep } from './chatClient';

/** Up to 4 "Try asking" questions built from today's moves file (names only, no numbers). */
export function suggestions(m: MovesFile | null): string[] {
  if (!m) return [];
  const out: string[] = [];
  const busiest = [...m.stores].sort((a, b) => b.in_units - a.in_units)[0];
  if (busiest && busiest.in_units > 0) out.push(`Why is ${busiest.city} ${busiest.store_id} getting so much today?`);
  if (m.moves.some((mv) => mv.needs_signoff)) out.push('Which moves need my sign-off?');
  if (m.stores.some((s) => s.tier === 'S++')) out.push('Why not take stock from the flagship stores?');
  for (const p of [...m.problems].sort((a, b) => a.rank - b.rank)) out.push(`Tell me more: ${p.title}`);
  if (m.summary.by_type.PULL_BACK > 0) out.push('What is coming back to the warehouse?');
  return out.slice(0, 4);
}

const TOKEN = /\b([A-Z]{2,4}-\d{2}(?:-[A-Z0-9]+)?|M\d{4})\b/g;

type Ids = { stores: Set<string>; moves: Set<string> };

/** Plain text with known move ids and store ids turned into links. */
function Linked({ text, ids }: { text: string; ids: Ids }) {
  const parts = text.split(TOKEN);
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 1 && ids.moves.has(p)) return <Link key={i} to={`/moves?move=${p}`} className="font-semibold text-cta underline hover:text-brown">{p}</Link>;
        if (i % 2 === 1 && ids.stores.has(p)) return <Link key={i} to={`/stores/${p}`} className="font-semibold text-cta underline hover:text-brown">{p}</Link>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

/** One line: **bold** spans become <strong>; everything else is text (React escapes it, so no HTML gets in). */
function Inline({ text, ids }: { text: string; ids: Ids }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1
        ? <strong key={i} className="font-semibold text-brown"><Linked text={p} ids={ids} /></strong>
        : <Linked key={i} text={p} ids={ids} />))}
    </>
  );
}

type Block = { kind: 'p'; line: string } | { kind: 'ul' | 'ol'; items: string[] } | { kind: 'gap' };
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

/**
 * Answer text. Renders only the Markdown subset the model uses: **bold**, "- " bullet lines,
 * "1. " numbered lines and line breaks. Anything else stays plain text. Move/store ids are links.
 */
export function AnswerText({ text, m }: { text: string; m: MovesFile | null }) {
  const ids: Ids = { stores: new Set(m?.stores.map((s) => s.store_id)), moves: new Set(m?.moves.map((mv) => mv.id)) };
  const blocks: Block[] = [];
  for (const line of text.split('\n')) {
    const b = BULLET.exec(line);
    const n = b ? null : NUMBERED.exec(line);
    const last = blocks[blocks.length - 1];
    if (b || n) {
      const kind = b ? 'ul' : 'ol';
      const item = (b ?? n)![1];
      if (last && last.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item] });
    } else if (!line.trim()) {
      if (last && last.kind !== 'gap') blocks.push({ kind: 'gap' });
    } else blocks.push({ kind: 'p', line });
  }
  return (
    <div className="flex flex-col">
      {blocks.map((bl, i) => {
        if (bl.kind === 'gap') return <div key={i} className="h-2" aria-hidden="true" />;
        if (bl.kind === 'p') return <p key={i} className="m-0"><Inline text={bl.line} ids={ids} /></p>;
        const List = bl.kind === 'ul' ? 'ul' : 'ol';
        return (
          <List key={i} className={`my-1 pl-6 ${bl.kind === 'ul' ? 'list-disc' : 'list-decimal'}`}>
            {bl.items.map((it, k) => <li key={k} className="pl-1"><Inline text={it} ids={ids} /></li>)}
          </List>
        );
      })}
    </div>
  );
}

const WIDER = ['HISTORY', 'RUNS', 'RULES'];
/** "today's list", or "your data" when the answer also used history, past runs or the rules. */
const sourceWords = (f: ChatFinal) => (f.kinds?.some((k) => WIDER.includes(k)) ? 'your data' : "today's list");
export const GENERAL_LABEL = 'General answer. Not checked against your data.';

/** Small line under each AI answer, straight from the backend's check result. */
export function StatusLine({ final }: { final: ChatFinal | null }) {
  if (!final) return <p className="m-0 text-[13px] font-semibold text-danger">Not answered</p>;
  const counted = final.numbers_total > 0 ? `${final.numbers_found} of ${final.numbers_total} numbers checked` : '';
  let text: string;
  let tone = 'text-danger';
  if (final.result === 'SHOWN') {
    tone = 'text-ok';
    if (final.mode === 'GENERAL') {
      text = GENERAL_LABEL;
      tone = 'text-muted';
    } else if (final.mode === 'MIXED') {
      text = counted ? `${counted} against ${sourceWords(final)}. The general part is not checked.` : 'No numbers about your data. The general part is not checked.';
    } else {
      text = counted ? `${counted} against ${sourceWords(final)}` : `No numbers in this answer. Uses only ${sourceWords(final)}`;
    }
  } else if (final.held_reason === 'FORECAST_REQUEST') {
    text = `Forecast not given${counted ? `. ${counted}` : ''}`;
  } else if (final.result === 'HELD_BACK') {
    text = `Held back. The answer used a number we could not check${counted ? ` (${counted})` : ''}`;
  } else {
    text = 'Not answered';
  }
  return <p className={`m-0 text-[13px] font-semibold ${tone}`}>{text}</p>;
}

/** The "In general:" heading a mixed answer uses (server: GENERAL_LINE in apps/api/src/ai/prompts.ts). */
const GENERAL_LINE = /^\s*\**\s*in general\s*:?\s*\**\s*:?/im;

/** Answer text; a general answer carries its label, and a mixed answer's general part sits in its own labelled box. */
export function AnswerBody({ text, final, m }: { text: string; final: ChatFinal | null; m: MovesFile | null }) {
  const shown = final?.result === 'SHOWN';
  if (shown && final?.mode === 'GENERAL') {
    return (
      <div className="flex flex-col gap-2">
        <span className="self-start rounded-full bg-white/70 px-2.5 py-0.5 text-[12px] font-bold tracking-wide text-muted uppercase">General answer</span>
        <AnswerText text={text} m={m} />
      </div>
    );
  }
  const at = shown && final?.mode === 'MIXED' ? GENERAL_LINE.exec(text) : null;
  if (!at) return <AnswerText text={text} m={m} />;
  const general = text.slice(at.index + at[0].length).replace(/^\s*\n/, '');
  return (
    <div className="flex flex-col gap-3">
      <AnswerText text={text.slice(0, at.index).trimEnd()} m={m} />
      <div className="rounded-xl border border-dashed border-[#D9C49C] bg-white/60 px-4 py-3">
        <div className="mb-1 text-[13px] font-semibold text-muted">{GENERAL_LABEL}</div>
        <AnswerText text={general.trim()} m={m} />
      </div>
    </div>
  );
}

function StepIcon({ status }: { status: ChatStep['status'] }) {
  if (status === 'start') {
    return <span aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#D9C49C] border-t-cta" />;
  }
  const ok = status === 'done';
  return (
    <span aria-hidden="true" className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${ok ? 'bg-ok' : 'bg-danger'}`}>
      {ok ? '✓' : '✕'}
    </span>
  );
}

function StepList({ steps }: { steps: ChatStep[] }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0">
      {steps.map((s) => (
        <li key={s.id} className="relative flex gap-2.5">
          <StepIcon status={s.status} />
          <div className="min-w-0 text-sm leading-snug">
            <span className={`font-semibold ${s.status === 'failed' ? 'text-danger' : 'text-ink'}`}>{s.label}</span>
            <span className="sr-only">{s.status === 'start' ? ' (working)' : s.status === 'done' ? ' (done)' : ' (failed)'}</span>
            {s.detail && <div className="text-muted [overflow-wrap:anywhere]">{s.detail}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * What the server is doing for this answer: its own pipeline stages, reported as they happen (not the model's
 * reasoning). Live while the answer is being prepared, then folded under the answer.
 */
export function Steps({ steps, live }: { steps: ChatStep[]; live: boolean }) {
  if (!steps.length) return null;
  if (live) {
    return (
      <div className="rounded-xl bg-white/70 px-4 py-3" aria-live="polite">
        <div className="mb-2 text-[12px] font-bold tracking-wide text-muted uppercase">Steps</div>
        <StepList steps={steps} />
      </div>
    );
  }
  const failed = steps.filter((s) => s.status === 'failed').length;
  return (
    <details className="group rounded-xl text-sm">
      <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg px-1 font-semibold text-muted hover:text-brown [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="transition-transform group-open:rotate-90">›</span>
        How Ask worked this out
        <span className="font-normal">· {steps.length} steps{failed ? ` · ${failed} did not pass` : ''}</span>
      </summary>
      <div className="mt-1 rounded-xl bg-white/70 px-4 py-3"><StepList steps={steps} /></div>
    </details>
  );
}

export function TypingDots() {
  return (
    <span className="inline-flex gap-1" aria-label="Stock Mover is typing">
      {[0, 150, 300].map((d) => (
        <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  );
}
