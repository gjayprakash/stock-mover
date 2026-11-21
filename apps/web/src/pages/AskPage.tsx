import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Banner } from '../components/Banner';
import { useMovesFile } from '../data/useMovesFile';
import { useAuth } from '../features/auth/auth';
import { dateShort, num, timeShort } from '../lib/format';
import { askChat, MAX_QUESTION, type Turn } from '../features/ask/chatClient';
import { loadChats, newChat, nextMsgId, saveChats, titleFrom, type AiMsg, type Chat, type Msg } from '../features/ask/chats';
import { AboutLine, MAX_TAGS, TagChip, TagPicker, tagSuggestions, toChatTags, type Tag } from '../features/ask/tags';
import { AnswerBody, StatusLine, Steps, TypingDots, suggestions } from '../features/ask/parts';

// Kept across screens for this browser session: which chat was open, practice mode, and the current tags.
const openChat: Record<string, string | null> = {};
let savedPractice = false;
let savedTags: Tag[] = [];

const NO_MSGS: Msg[] = [];
const when = (iso: string | null) => (iso ? `${dateShort(iso)}, ${timeShort(iso)}` : 'an earlier list');

export default function AskPage() {
  const { data, isSample } = useMovesFile();
  const { me } = useAuth();
  const user = me?.email ?? 'anon';
  // Chats live in this browser (localStorage), per signed-in user, newest first.
  const [chats, setChats] = useState<Chat[]>(() => loadChats(user));
  const [currentId, setCurrentId] = useState<string | null>(() => openChat[user] ?? null);
  const [loadedFor, setLoadedFor] = useState(user);
  if (loadedFor !== user) {
    setLoadedFor(user);
    setChats(loadChats(user));
    setCurrentId(openChat[user] ?? null);
  }
  const current = chats.find((c) => c.id === currentId) ?? null;
  const msgs: Msg[] = current?.msgs ?? NO_MSGS;
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [practice, setPractice] = useState(savedPractice);
  const [sheet, setSheet] = useState(false);
  // Tagged stores/products stay for following questions until removed.
  const [tags, setTags] = useState<Tag[]>(savedTags);
  const [picker, setPicker] = useState(false);
  const [pickerQ, setPickerQ] = useState('');
  const pickerKey = useRef<((e: KeyboardEvent) => void) | null>(null);
  const openPicker = () => { setPickerQ(''); setPicker(true); };
  const narrow = useNarrow();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { savedTags = tags; }, [tags]);
  useEffect(() => { openChat[user] = currentId; }, [user, currentId]);
  // Saved when nothing is streaming (not on every chunk); the question itself is saved as soon as it is sent.
  useEffect(() => { if (!busy) saveChats(user, chats); }, [busy, chats, user]);
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
    const el = listRef.current;
    if (el && follow.current && msgs.length) el.scrollTop = el.scrollHeight;
  }, [msgs]);
  useEffect(() => { follow.current = true; }, [currentId]);
  // The practice banner appears after the first answer and shortens the list: stay at the bottom.
  useEffect(() => { const el = listRef.current; if (el && follow.current && msgs.length) el.scrollTop = el.scrollHeight; }, [practice]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((id: string, fn: (c: Chat) => Chat) => setChats((cs) => cs.map((c) => (c.id === id ? fn(c) : c))), []);

  const startNew = () => {
    setCurrentId(null);
    setTags([]);
    setInput('');
    setSheet(false);
    inputRef.current?.focus();
  };
  const open = (id: string) => { setCurrentId(id); setSheet(false); };
  const remove = (id: string) => {
    setChats((cs) => cs.filter((c) => c.id !== id));
    if (id === currentId) setCurrentId(null);
  };

  const send = async (raw: string, withTags: Tag[] = tags, fresh = false) => {
    const question = raw.trim().slice(0, MAX_QUESTION);
    if (!question || busy) return;
    const runId = data?.run.run_id ?? null;
    const runAt = data?.run.generated_at ?? null;
    let chat = !fresh && current ? current : newChat(runId, runAt);
    const history: Turn[] = chat.msgs
      .filter((m): m is Exclude<Msg, { note: true }> => !('note' in m))
      .filter((m) => m.me || (!m.pending && m.final?.result === 'SHOWN'))
      .map((m) => ({ role: m.me ? 'user' : 'assistant', content: m.text }));
    let id = nextMsgId(chat);
    const added: Msg[] = [];
    // A chat is not tied to one run: say so when it continues on a newer list.
    if (chat.msgs.length && runId && chat.lastRunId && chat.lastRunId !== runId) {
      added.push({ id: id++, note: true, text: `This chat started on the list of ${when(chat.runAt)}. Answers from here use the newer list of ${when(runAt)}.` });
    }
    const aiId = id + 1;
    added.push({ id, me: true, text: question, tags: withTags }, { id: aiId, me: false, text: '', pending: true, final: null, sentTags: withTags, steps: [] });
    const now = new Date().toISOString();
    chat = { ...chat, title: chat.title || titleFrom(question), updatedAt: now, lastRunId: runId ?? chat.lastRunId, msgs: [...chat.msgs, ...added] };
    const chatId = chat.id;
    const next = [chat, ...chats.filter((c) => c.id !== chatId)];
    setChats(next);
    saveChats(user, next);
    setCurrentId(chatId);
    setInput('');
    setBusy(true);
    follow.current = true;
    const patch = (p: Partial<AiMsg>) =>
      update(chatId, (c) => ({ ...c, msgs: c.msgs.map((m) => (m.id === aiId && m.me === false ? { ...m, ...p } : m)) }));
    const res = await askChat(question, history, { onText: (text) => patch({ text }), onSteps: (steps) => patch({ steps }) }, data, toChatTags(withTags));
    patch({ text: res.text, final: res.final, pending: false, steps: res.steps });
    update(chatId, (c) => ({ ...c, updatedAt: new Date().toISOString() }));
    if (res.practice) { savedPractice = true; setPractice(true); }
    setBusy(false);
  };

  // ?q= from another screen is asked once, in a new chat, as soon as the moves file is in.
  const q = params.get('q');
  useEffect(() => {
    if (!q || !data || sentQ.current === q) return;
    sentQ.current = q;
    setParams((p) => { p.delete('q'); return p; }, { replace: true });
    void send(q, tags, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, data]);

  // Enter while the picker is open chooses a tag; it never sends the question.
  const onSubmit = (e: FormEvent) => { e.preventDefault(); if (!picker) void send(input); };
  const tries = tags.length ? tagSuggestions(data, tags) : suggestions(data);
  const lastAi = [...msgs].reverse().find((m): m is AiMsg => m.me === false);

  const canSee = (
    <div className="rounded-2xl bg-ok-bg p-5 text-[15px] leading-relaxed text-[#123D2E] lg:p-6">
      <div className="mb-1.5 text-base font-bold">What Ask can see</div>
      {data
        ? `Today's ${num(data.summary.moves)} moves, the ${num(data.stores.length)} ${data.stores.length === 1 ? 'store' : 'stores'} and ${num(data.problems.length)} problems, the last 12 weeks of sales and stock for the products on the list, past runs and the rules. Every number about these is checked.`
        : "Today's list, the last 12 weeks of sales and stock, past runs and the rules. Every number about these is checked."}
      <p className="mt-2 mb-0">Anything else gets a general answer, labelled as not checked against your data.</p>
      {isSample && <p className="mt-2 mb-0 text-sm">Showing the sample list because today's run could not be loaded.</p>}
    </div>
  );

  const chatList = (
    <ChatList chats={chats} currentId={currentId} onOpen={open} onNew={startNew} onDelete={remove} />
  );

  // Fills the window (the shell gives this route a full-height main); the page itself never scrolls.
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 md:gap-6">
      <div className="flex shrink-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 font-heading text-3xl font-normal text-ink md:text-[40px]">Ask Stock Mover</h1>
          <p className={`mt-1 mb-0 text-[15px] text-muted md:mt-2 md:block md:text-[17px] ${msgs.length ? 'hidden' : ''}`}>
            Ask anything. Answers about your stock are checked number by number; general answers are labelled.
          </p>
        </div>
        <div className="flex shrink-0 gap-2 pt-1 lg:hidden">
          <Button variant="outline" size="sm" onClick={() => setSheet(true)} aria-haspopup="dialog">
            Chats{chats.length ? ` (${chats.length})` : ''}
          </Button>
          {msgs.length > 0 && <Button variant="ghost" size="sm" onClick={startNew} className="max-sm:hidden">New chat</Button>}
        </div>
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
              <p className="m-0 font-heading text-xl text-brown">What would you like to know?</p>
              {tries.map((t) => (
                <button key={t} type="button" onClick={() => void send(t)} disabled={busy}
                  className="min-h-14 rounded-xl bg-tint px-5 py-3 text-left text-[17px] font-medium text-brown hover:bg-cta-bg disabled:opacity-50">
                  {t}
                </button>
              ))}
              <p className="m-0 text-[15px] text-muted">General questions are welcome too, for example what a term means or how to use a screen.</p>
              <div className="mt-3 lg:hidden">{canSee}</div>
            </div>
          ) : (
            <div className="flex flex-col gap-6" aria-live="polite">
              {current && (
                <p className="m-0 text-center text-[13px] text-muted">
                  Started {when(current.createdAt)} on the list of {when(current.runAt)}
                </p>
              )}
              {msgs.map((m) =>
                'note' in m ? (
                  <p key={m.id} className="m-0 self-center rounded-full bg-warn-bg px-4 py-1.5 text-center text-[13px] font-semibold text-warn">{m.text}</p>
                ) : m.me ? (
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
                    {m.pending && <Steps steps={m.steps ?? []} live />}
                    {(m.text || !m.pending || !(m.steps ?? []).length) && (
                      <div className="rounded-2xl rounded-bl-sm bg-tint px-5 py-4 text-base leading-relaxed text-ink">
                        {m.pending && !m.text ? <TypingDots /> : <AnswerBody text={m.text} final={m.pending ? null : m.final} m={data} />}
                      </div>
                    )}
                    {!m.pending && <StatusLine final={m.final} />}
                    {!m.pending && <AboutLine about={m.final?.about} sent={m.sentTags} m={data} />}
                    {!m.pending && <Steps steps={m.steps ?? []} live={false} />}
                    {!m.pending && m === lastAi && <NextQuestions m={m} fallback={suggestions(data)} busy={busy} onAsk={(t) => void send(t)} />}
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
                <TagPicker m={data} taken={tags} onPick={addTag} onClose={closePicker} q={pickerQ} onQ={setPickerQ} keyRef={pickerKey} />
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
                  // Letters typed after "@" before focus moves go to the picker's filter, not the question.
                  const v = e.target.value;
                  const at = v.indexOf('@', Math.max(0, input.length - 1));
                  if (picker) {
                    if (v.startsWith(input) && v.length > input.length) setPickerQ((q) => q + v.slice(input.length).replace(/^@/, ''));
                    else setInput(v);
                  } else if (v.startsWith(input) && v.length > input.length && at >= input.length && tags.length < MAX_TAGS) {
                    setInput(v.slice(0, at));
                    setPickerQ(v.slice(at + 1));
                    setPicker(true);
                  } else setInput(v);
                }}
                onKeyDown={(e) => { if (picker && pickerKey.current && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) pickerKey.current(e); }}
                placeholder={narrow ? 'Ask anything, or @ to tag' : 'Ask anything, or type @ to tag a store or product'}
                className="h-14 w-full min-w-0 rounded-xl border-[1.5px] border-[#D9C49C] bg-[#FFFDF8] px-4 text-[17px] text-ink disabled:opacity-60 md:px-[18px]" />
            </div>
            <Button type="button" variant="outline" disabled={busy || tags.length >= MAX_TAGS} onClick={() => (picker ? setPicker(false) : openPicker())}
              aria-expanded={picker} aria-label="Tag a store or product" title={tags.length >= MAX_TAGS ? `At most ${MAX_TAGS} tags` : undefined}
              className="h-14 shrink-0 px-4">
              <span aria-hidden="true" className="text-xl xl:hidden">@</span><span aria-hidden="true" className="max-xl:hidden">Tag a store or product</span>
            </Button>
            <Button type="submit" disabled={busy || !input.trim()} className="h-14 shrink-0 px-5 md:px-7">{busy ? 'Asking…' : 'Ask'}</Button>
          </form>
        </Card>
        <aside className="-mx-4 hidden min-h-0 w-80 shrink-0 flex-col gap-5 overflow-y-auto overscroll-contain px-4 pb-4 lg:flex xl:w-88">
          <Card className="flex shrink-0 flex-col" padded={false}>{chatList}</Card>
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
      {sheet && <ChatSheet onClose={() => setSheet(false)}>{chatList}</ChatSheet>}
    </div>
  );
}

/** "Your chats": newest first, each titled from its first question with its date. Delete asks once. */
function ChatList({ chats, currentId, onOpen, onNew, onDelete }: {
  chats: Chat[]; currentId: string | null; onOpen: (id: string) => void; onNew: () => void; onDelete: (id: string) => void;
}) {
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3 lg:px-6">
        <h2 className="m-0 text-[17px] font-bold">Your chats</h2>
        <Button size="sm" variant="outline" onClick={onNew}>New chat</Button>
      </div>
      {chats.length === 0 ? (
        <p className="m-0 px-5 pb-5 text-[15px] text-muted lg:px-6">Your questions are kept here, in this browser, so you can go back to them.</p>
      ) : (
        <ul className="m-0 flex max-h-[min(40vh,420px)] list-none flex-col gap-1 overflow-y-auto overscroll-contain px-3 pb-3 max-lg:max-h-none">
          {chats.map((c) => {
            const active = c.id === currentId;
            return (
              <li key={c.id} className={`group flex items-stretch gap-1 rounded-xl ${active ? 'bg-tint' : 'hover:bg-page'}`}>
                {confirm === c.id ? (
                  <div className="flex flex-1 items-center justify-between gap-2 px-3 py-2">
                    <span className="text-sm font-semibold">Delete this chat?</span>
                    <span className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Keep</Button>
                      <Button size="sm" onClick={() => { onDelete(c.id); setConfirm(null); }}>Delete</Button>
                    </span>
                  </div>
                ) : (
                  <>
                    <button type="button" onClick={() => onOpen(c.id)} aria-current={active ? 'true' : undefined}
                      className="min-w-0 flex-1 rounded-xl px-3 py-2.5 text-left">
                      <span className={`line-clamp-2 text-[15px] leading-snug ${active ? 'font-semibold text-brown' : 'text-ink'}`}>{c.title || 'New chat'}</span>
                      <span className="mt-0.5 block text-[13px] text-muted">{dateShort(c.updatedAt)}, {timeShort(c.updatedAt)}</span>
                    </button>
                    <button type="button" onClick={() => setConfirm(c.id)} aria-label={`Delete chat: ${c.title}`}
                      className="shrink-0 rounded-xl px-3 text-lg text-muted hover:bg-cta-bg hover:text-danger lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100">
                      <span aria-hidden="true">×</span>
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Phone / tablet: the chat list as a sheet from the bottom. */
function ChatSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Your chats">
      <button type="button" aria-label="Close chats" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[80dvh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-card">
        <div className="flex justify-center pt-2"><span className="h-1.5 w-10 rounded-full bg-line" /></div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">{children}</div>
        <div className="border-t border-line p-3"><Button variant="ghost" full onClick={onClose}>Close</Button></div>
      </div>
    </div>
  );
}

/** Follow-ups under the latest answer: the server's `suggestions`, or (older server, dead-end reply) three from the general builder. */
function NextQuestions({ m, fallback, busy, onAsk }: { m: AiMsg; fallback: string[]; busy: boolean; onAsk: (q: string) => void }) {
  const server = m.final?.suggestions ?? [];
  const deadEnd = !m.final?.suggestions && m.text.trim().startsWith("That is not in today's data");
  const list = server.length ? server.slice(0, 4) : deadEnd ? fallback.slice(0, 3) : [];
  if (!list.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[13px] font-semibold text-muted">Ask next</div>
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

/** True under 640 px, for the shorter question hint (a placeholder cannot be changed with CSS). */
function useNarrow() {
  const q = '(max-width: 639px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}
