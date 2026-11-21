import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Banner } from '../components/Banner';
import { useMovesFile } from '../data/useMovesFile';
import { num } from '../lib/format';
import { askChat, MAX_QUESTION, type ChatFinal, type Turn } from '../features/ask/chatClient';
import { AboutLine, MAX_TAGS, TagChip, TagPicker, tagSuggestions, toChatTags, type Tag } from '../features/ask/tags';
import { AnswerText, StatusLine, TypingDots, suggestions } from '../features/ask/parts';

type Msg =
  | { id: number; me: true; text: string; tags: Tag[] }
  | { id: number; me: false; text: string; pending: boolean; final: ChatFinal | null; sentTags: Tag[] };

// Conversation lives in memory for this browser session only (survives moving between screens).
let saved: Msg[] = [];
let nextId = 1;
let savedPractice = false;
let savedTags: Tag[] = [];

export default function AskPage() {
  const { data, isSample } = useMovesFile();
  // An answer still streaming when the user left this screen is shown as not answered.
  const [msgs, setMsgs] = useState<Msg[]>(() => saved.map((m) => (!m.me && m.pending ? { ...m, pending: false } : m)));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [practice, setPractice] = useState(savedPractice);
  // Tagged stores/products stay for following questions until removed.
  const [tags, setTags] = useState<Tag[]>(savedTags);
  const [picker, setPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { savedTags = tags; }, [tags]);
  const addTag = (t: Tag) => {
    setTags((cur) => (cur.length >= MAX_TAGS || cur.some((x) => x.kind === t.kind && x.id === t.id) ? cur : [...cur, t]));
    setPicker(false);
    inputRef.current?.focus();
  };
  const closePicker = () => { setPicker(false); inputRef.current?.focus(); };
  const [params, setParams] = useSearchParams();
  const sentQ = useRef<string | null>(null);
  // Only the message list scrolls. Follow the newest message unless the user has scrolled up to read.
  const listRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const onListScroll = () => {
    const el = listRef.current;
    if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    saved = msgs;
    const el = listRef.current;
    if (el && follow.current) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const send = async (raw: string, withTags: Tag[] = tags) => {
    const question = raw.trim().slice(0, MAX_QUESTION);
    if (!question || busy) return;
    const history: Turn[] = msgs
      .filter((m) => m.me || (!m.pending && m.final?.result === 'SHOWN'))
      .map((m) => ({ role: m.me ? 'user' : 'assistant', content: m.text }));
    const aiId = nextId + 1;
    nextId += 2;
    setInput('');
    setBusy(true);
    follow.current = true;
    setMsgs((cur) => [...cur, { id: aiId - 1, me: true, text: question, tags: withTags }, { id: aiId, me: false, text: '', pending: true, final: null, sentTags: withTags }]);
    const patch = (p: Partial<Extract<Msg, { me: false }>>) =>
      setMsgs((cur) => cur.map((m) => (m.id === aiId && !m.me ? { ...m, ...p } : m)));
    const res = await askChat(question, history, (text) => patch({ text }), data, toChatTags(withTags));
    patch({ text: res.text, final: res.final, pending: false });
    if (res.practice) { savedPractice = true; setPractice(true); }
    setBusy(false);
  };

  // ?q= from another screen is sent once, as soon as the moves file is in.
  const q = params.get('q');
  useEffect(() => {
    if (!q || !data || sentQ.current === q) return;
    sentQ.current = q;
    setParams((p) => { p.delete('q'); return p; }, { replace: true });
    void send(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, data]);

  const onSubmit = (e: FormEvent) => { e.preventDefault(); void send(input); };
  const tries = tags.length ? tagSuggestions(data, tags) : suggestions(data);

  const canSee = (
    <div className="rounded-2xl bg-ok-bg p-5 text-[15px] leading-relaxed text-[#123D2E] lg:p-6">
      <div className="mb-1.5 text-base font-bold">What Ask can see</div>
      {data
        ? `Today's ${num(data.summary.moves)} moves, the ${num(data.stores.length)} stores, the ${num(data.problems.length)} problems and the rules. Nothing outside that.`
        : "Today's list, the stores, the problems and the rules. Nothing outside that."}
      {isSample && <p className="mt-2 mb-0 text-sm">Showing the sample list because today's run could not be loaded.</p>}
    </div>
  );

  // Fills the window (the shell gives this route a full-height main); the page itself never scrolls.
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 md:gap-6">
      <div className="shrink-0">
        <h1 className="m-0 font-heading text-3xl font-normal text-ink md:text-[40px]">Ask Stock Mover</h1>
        <p className={`mt-1 mb-0 text-[15px] text-muted md:mt-2 md:block md:text-[17px] ${msgs.length ? 'hidden' : ''}`}>Ask in your own words. Answers use only today's list, and every number is checked.</p>
      </div>
      {practice && (
        <div className="shrink-0">
          <Banner tone="warn" title="Practice answers.">The Ask service is not running on this computer, so these answers are made up from the sample list to show the screen.</Banner>
        </div>
      )}
      <div className="flex min-h-0 flex-1 gap-7">
        <Card padded={false} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div ref={listRef} onScroll={onListScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 md:p-8">
          {msgs.length === 0 ? (
            <div className="flex flex-col gap-3">
              <p className="m-0 font-heading text-xl text-brown">What would you like to know about today's list?</p>
              {tries.map((t) => (
                <button key={t} type="button" onClick={() => void send(t)} disabled={busy}
                  className="min-h-14 rounded-xl bg-tint px-5 py-3 text-left text-[17px] font-medium text-brown hover:bg-cta-bg disabled:opacity-50">
                  {t}
                </button>
              ))}
              <div className="mt-3 lg:hidden">{canSee}</div>
            </div>
          ) : (
            <div className="flex flex-col gap-6" aria-live="polite">
              {msgs.map((m) =>
                m.me ? (
                  <div key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-brown px-[18px] py-3.5 text-base leading-normal text-page md:max-w-[78%]">
                    {m.tags.length > 0 && (
                      <div className="mb-1.5 flex flex-wrap gap-1.5">
                        {m.tags.map((t) => (
                          <span key={`${t.kind}-${t.id}`} className="rounded-full bg-page/15 px-2.5 py-0.5 text-[13px] font-semibold">About: {t.label}</span>
                        ))}
                      </div>
                    )}
                    {m.text}
                  </div>
                ) : (
                  <div key={m.id} className="flex max-w-[92%] flex-col gap-2 md:max-w-[86%]">
                    <div className="rounded-2xl rounded-bl-sm bg-tint px-5 py-4 text-base leading-relaxed whitespace-pre-wrap text-ink">
                      {m.pending && !m.text ? <TypingDots /> : <AnswerText text={m.text} m={data} />}
                    </div>
                    {!m.pending && <StatusLine final={m.final} />}
                    {!m.pending && <AboutLine about={m.final?.about} sent={m.sentTags} m={data} />}
                    {!m.pending && <NextQuestions m={m} fallback={suggestions(data)} busy={busy} onAsk={(t) => void send(t)} />}
                  </div>
                ),
              )}
            </div>
          )}
          </div>
          {/* Under 1024 px there is no side column: suggestions ride in a sideways-scrolling row above the input. */}
          {msgs.length > 0 && tries.length > 0 && (
            <div className="flex shrink-0 gap-2 overflow-x-auto border-t border-line px-5 py-3 md:px-8 lg:hidden" aria-label="Try asking">
              {tries.map((t) => (
                <button key={t} type="button" onClick={() => void send(t)} disabled={busy}
                  className="max-w-[80%] shrink-0 truncate rounded-full bg-tint px-4 py-2 text-[15px] font-medium text-brown hover:bg-cta-bg disabled:opacity-50">
                  {t}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={onSubmit} className="relative flex shrink-0 flex-wrap items-end gap-3 border-t border-line px-5 py-4 md:px-8 md:py-5">
            {picker && (
              <div className="absolute inset-x-3 bottom-full md:inset-x-8">
                <TagPicker m={data} taken={tags} onPick={addTag} onClose={closePicker} />
              </div>
            )}
            {tags.length > 0 && (
              <div className="flex w-full flex-wrap gap-2" aria-label="Tagged">
                {tags.map((t) => (
                  <TagChip key={`${t.kind}-${t.id}`} tag={t} onRemove={() => setTags((cur) => cur.filter((x) => x !== t))} />
                ))}
              </div>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <label htmlFor="ask-input" className="text-sm font-semibold max-md:sr-only">Your question</label>
              <input id="ask-input" type="text" value={input} maxLength={MAX_QUESTION} disabled={busy}
                ref={inputRef}
                onChange={(e) => {
                  // Typing "@" opens the picker (checked on the value, since phone keyboards do not report the key).
                  const v = e.target.value;
                  if (v.length === input.length + 1 && v.endsWith('@') && tags.length < MAX_TAGS) { setInput(v.slice(0, -1)); setPicker(true); }
                  else setInput(v);
                }}
                placeholder="Type a question, or @ to tag a store or product"
                className="h-14 w-full min-w-0 rounded-xl border-[1.5px] border-[#D9C49C] bg-[#FFFDF8] px-4 text-[17px] text-ink disabled:opacity-60 md:px-[18px]" />
            </div>
            <Button type="button" variant="outline" disabled={busy || tags.length >= MAX_TAGS} onClick={() => setPicker((o) => !o)}
              aria-expanded={picker} aria-label="Tag a store or product" title={tags.length >= MAX_TAGS ? `At most ${MAX_TAGS} tags` : undefined}
              className="h-14 shrink-0 px-4">
              <span aria-hidden="true" className="text-xl xl:hidden">@</span><span aria-hidden="true" className="max-xl:hidden">Tag a store or product</span>
            </Button>
            <Button type="submit" disabled={busy || !input.trim()} className="h-14 shrink-0 px-5 md:px-7">{busy ? 'Asking…' : 'Ask'}</Button>
          </form>
        </Card>
        <aside className="-mx-4 hidden min-h-0 w-80 shrink-0 flex-col gap-5 overflow-y-auto overscroll-contain px-4 pb-4 lg:flex xl:w-88">
          {msgs.length > 0 && tries.length > 0 && (
            <Card className="flex shrink-0 flex-col gap-3" padded={false}>
              <div className="flex flex-col gap-3 p-6">
                <div className="text-[17px] font-bold">Try asking</div>
                {tries.map((t) => (
                  <button key={t} type="button" onClick={() => void send(t)} disabled={busy}
                    className="min-h-12 rounded-xl bg-tint px-4 py-2.5 text-left text-[15px] font-medium text-brown hover:bg-cta-bg disabled:opacity-50">
                    {t}
                  </button>
                ))}
              </div>
            </Card>
          )}
          <div className="shrink-0">{canSee}</div>
        </aside>
      </div>
    </div>
  );
}

/** Questions under one answer: the server's `suggestions`, or (older server, dead-end reply) three from the general builder. */
function NextQuestions({ m, fallback, busy, onAsk }: { m: Extract<Msg, { me: false }>; fallback: string[]; busy: boolean; onAsk: (q: string) => void }) {
  const server = m.final?.suggestions ?? [];
  const deadEnd = !m.final?.suggestions && m.text.trim().startsWith("That is not in today's data");
  const list = server.length ? server.slice(0, 4) : deadEnd ? fallback.slice(0, 3) : [];
  if (!list.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[13px] font-semibold text-muted">Try asking</div>
      <div className="flex flex-wrap gap-2">
        {list.map((t) => (
          <button key={t} type="button" onClick={() => onAsk(t)} disabled={busy}
            className="rounded-full bg-tint px-3.5 py-1.5 text-left text-sm font-medium text-brown hover:bg-cta-bg disabled:opacity-50">
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
