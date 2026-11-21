import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import type { MovesFile } from '@sm/contract';
import type { ChatFinal } from './chatClient';

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

/** Small line under each AI answer, straight from the backend's grounding result. */
export function StatusLine({ final }: { final: ChatFinal | null }) {
  if (!final) return <p className="m-0 text-[13px] font-semibold text-danger">Not answered</p>;
  const counted = final.numbers_total > 0 ? `${final.numbers_found} of ${final.numbers_total} numbers checked` : '';
  let text: string;
  let ok = false;
  if (final.result === 'SHOWN') {
    ok = true;
    text = counted ? `${counted} against today's list` : "No numbers in this answer. Uses only today's list";
  } else if (final.held_reason === 'FORECAST_REQUEST') {
    text = `Forecast not given${counted ? `. ${counted}` : ''}`;
  } else if (final.result === 'HELD_BACK') {
    text = `Not in today's data. The first answer used a number we could not check, so it was held back${counted ? ` (${counted})` : ''}`;
  } else {
    text = 'Not answered';
  }
  return <p className={`m-0 text-[13px] font-semibold ${ok ? 'text-ok' : 'text-danger'}`}>{text}</p>;
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
