import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import type { MovesFile } from '@sm/contract';
import { storeLabel } from '../../lib/format';
import type { About, ChatTags } from './chatClient';

export const MAX_TAGS = 5;

export type Tag = { kind: 'store' | 'sku' | 'move'; id: string; label: string };

/** Everything that can be tagged, from today's list: every store + the warehouse, and every SKU in today's moves. */
export function tagOptions(m: MovesFile | null): { stores: Tag[]; products: Tag[] } {
  if (!m) return { stores: [], products: [] };
  const stores: Tag[] = [...m.stores.map((s) => s.store_id), 'WH-KOL'].map((id) => ({ kind: 'store', id, label: storeLabel(id, m.stores) }));
  const seen = new Set<string>();
  const products: Tag[] = [];
  for (const mv of m.moves) {
    if (seen.has(mv.sku_id)) continue;
    seen.add(mv.sku_id);
    products.push({ kind: 'sku', id: mv.sku_id, label: `${mv.style_name}, size ${mv.size} · ${mv.sku_id}` });
  }
  products.sort((a, b) => a.label.localeCompare(b.label));
  return { stores, products };
}

/** Label for any id the server or the user named. */
export function labelFor(kind: Tag['kind'], id: string, m: MovesFile | null): string {
  if (kind === 'store') return storeLabel(id, m?.stores);
  if (kind === 'sku') {
    const mv = m?.moves.find((x) => x.sku_id === id);
    return mv ? `${mv.style_name}, size ${mv.size} · ${id}` : id;
  }
  return id;
}

export const toChatTags = (tags: Tag[]): ChatTags => ({
  stores: tags.filter((t) => t.kind === 'store').map((t) => t.id),
  skus: tags.filter((t) => t.kind === 'sku').map((t) => t.id),
  moves: tags.filter((t) => t.kind === 'move').map((t) => t.id),
});

const short = (id: string, m: MovesFile) => (id === 'WH-KOL' ? 'the warehouse (WH-KOL)' : `${m.stores.find((s) => s.store_id === id)?.city ?? ''} ${id}`.trim());

/** "Try asking" questions about the tagged stores and products: templates + names from the data, no numbers. */
export function tagSuggestions(m: MovesFile | null, tags: Tag[]): string[] {
  if (!m || tags.length === 0) return [];
  const out: string[] = [];
  for (const t of tags) {
    if (t.kind === 'store') {
      const s = short(t.id, m);
      const mine = m.moves.filter((mv) => mv.from === t.id || mv.to === t.id);
      out.push(`What is arriving at ${s} today, and from where?`);
      if (mine.some((mv) => mv.needs_signoff)) out.push(`Which moves for ${s} need my sign-off?`);
      out.push(`What is ${s} short of?`);
      if (mine.some((mv) => mv.from === t.id)) out.push(`What is leaving ${s} today?`);
    } else if (t.kind === 'sku') {
      const name = m.moves.find((mv) => mv.sku_id === t.id)?.style_name;
      out.push(`Where is ${name ? `${name} (${t.id})` : t.id} moving today?`);
      out.push(`Where is ${t.id} sold out?`);
      out.push(`Where is ${t.id} sitting as old stock?`);
    } else {
      out.push(`Why was ${t.id} suggested?`);
    }
  }
  return [...new Set(out)].slice(0, 4);
}

/** Searchable picker (stores + products). Opens above the input; Esc closes, arrows + Enter choose. */
export function TagPicker({ m, taken, onPick, onClose }: { m: MovesFile | null; taken: Tag[]; onPick: (t: Tag) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const opts = useMemo(() => tagOptions(m), [m]);
  const groups = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const ok = (t: Tag) => !taken.some((x) => x.kind === t.kind && x.id === t.id) && words.every((w) => t.label.toLowerCase().includes(w));
    return [
      { name: 'Stores', items: opts.stores.filter(ok) },
      { name: 'Products', items: opts.products.filter(ok) },
    ];
  }, [q, opts, taken]);
  const flat = groups.flatMap((g) => g.items);

  useEffect(() => { inputRef.current?.focus(); }, []);
  // Never taller than the space between the card top and the input row (the card clips overflow),
  // re-measured when a phone keyboard resizes the window.
  const rootRef = useRef<HTMLDivElement>(null);
  const [maxH, setMaxH] = useState(360);
  useLayoutEffect(() => {
    const measure = () => {
      const form = rootRef.current?.closest('form');
      const card = form?.parentElement;
      if (form && card) setMaxH(Math.max(160, Math.min(360, form.getBoundingClientRect().top - card.getBoundingClientRect().top - 12)));
    };
    measure();
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => { window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure); };
  }, []);
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (flat[active]) onPick(flat[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  let i = -1;
  return (
    <div ref={rootRef} style={{ maxHeight: maxH }} className="absolute inset-x-0 bottom-full z-20 mb-2 flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-card"
      role="dialog" aria-label="Tag a store or product">
      <div className="flex shrink-0 items-center gap-2 border-b border-line p-3">
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
          role="combobox" aria-expanded="true" aria-controls="ask-tag-list" aria-activedescendant={flat[active] ? `ask-tag-${active}` : undefined}
          placeholder="Search by store, city, product or code"
          className="h-11 min-w-0 flex-1 rounded-lg border-[1.5px] border-[#D9C49C] bg-[#FFFDF8] px-3 text-base text-ink" />
        <button type="button" onClick={onClose} className="h-11 rounded-lg px-3 text-sm font-semibold text-brown hover:bg-tint">Close</button>
      </div>
      <ul ref={listRef} id="ask-tag-list" role="listbox" className="m-0 min-h-0 flex-1 list-none overflow-y-auto overscroll-contain p-2">
        {flat.length === 0 && <li className="px-3 py-4 text-muted">Nothing in today's list matches.</li>}
        {groups.map((g) => g.items.length > 0 && (
          <Fragment key={g.name}>
            <li role="presentation" className="px-3 pt-2 pb-1 text-xs font-bold tracking-wide text-muted uppercase">{g.name}</li>
            {g.items.map((t) => {
              i += 1;
              const idx = i;
              return (
                <li key={`${t.kind}-${t.id}`} id={`ask-tag-${idx}`} data-i={idx} role="option" aria-selected={idx === active}
                  onMouseDown={(e) => { e.preventDefault(); onPick(t); }} onMouseEnter={() => setActive(idx)}
                  className={`cursor-pointer rounded-lg px-3 py-2.5 text-[15px] ${idx === active ? 'bg-tint text-brown' : 'text-ink'}`}>
                  {t.label}
                </li>
              );
            })}
          </Fragment>
        ))}
      </ul>
    </div>
  );
}

/** "About: Lucknow · LKO-01 ×" chip above the input. */
export function TagChip({ tag, onRemove }: { tag: Tag; onRemove?: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-cta-bg py-1 pr-1 pl-3 text-sm font-semibold text-[#8A2C07]">
      <span className="truncate">About: {tag.label}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${tag.label}`}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-base hover:bg-white/70">×</button>
      )}
    </span>
  );
}

const sameIds = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((x) => b.includes(x));

/** Quiet "Understood as: …" line, only when the server's `about` differs from the tags sent. */
export function AboutLine({ about, sent, m }: { about?: About; sent: Tag[]; m: MovesFile | null }) {
  if (!about) return null;
  const s = toChatTags(sent);
  const total = about.moves.length + about.stores.length + about.skus.length;
  if (total === 0) return null;
  if (sameIds(about.moves, s.moves) && sameIds(about.stores, s.stores) && sameIds(about.skus, s.skus)) return null;
  const items = [
    ...about.moves.map((id) => ({ to: `/moves?move=${id}`, text: id })),
    ...about.stores.map((id) => ({ to: `/stores/${id}`, text: labelFor('store', id, m) })),
    ...about.skus.map((id) => ({ to: `/moves?sku=${id}`, text: id })),
  ];
  return (
    <p className="m-0 text-[13px] text-muted">
      Understood as:{' '}
      {items.map((it, k) => (
        <Fragment key={it.to}>
          {k > 0 && ' · '}
          <Link to={it.to} className="font-semibold text-cta underline hover:text-brown">{it.text}</Link>
        </Fragment>
      ))}
    </p>
  );
}
