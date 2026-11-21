import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Banner } from '../components/Banner';
import { useMovesFile } from '../data/useMovesFile';
import { num } from '../lib/format';
import { askChat, MAX_QUESTION, type ChatFinal, type Turn } from '../features/ask/chatClient';
import { AnswerText, StatusLine, TypingDots, suggestions } from '../features/ask/parts';

type Msg =
  | { id: number; me: true; text: string }
  | { id: number; me: false; text: string; pending: boolean; final: ChatFinal | null };

// Conversation lives in memory for this browser session only (survives moving between screens).
let saved: Msg[] = [];
let nextId = 1;
let savedPractice = false;

export default function AskPage() {
  const { data, isSample } = useMovesFile();
  // An answer still streaming when the user left this screen is shown as not answered.
  const [msgs, setMsgs] = useState<Msg[]>(() => saved.map((m) => (!m.me && m.pending ? { ...m, pending: false } : m)));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [practice, setPractice] = useState(savedPractice);
  const [params, setParams] = useSearchParams();
  const sentQ = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { saved = msgs; endRef.current?.scrollIntoView({ block: 'nearest' }); }, [msgs]);

  const send = async (raw: string) => {
    const question = raw.trim().slice(0, MAX_QUESTION);
    if (!question || busy) return;
    const history: Turn[] = msgs
      .filter((m) => m.me || (!m.pending && m.final?.result === 'SHOWN'))
      .map((m) => ({ role: m.me ? 'user' : 'assistant', content: m.text }));
    const aiId = nextId + 1;
    nextId += 2;
    setInput('');
    setBusy(true);
    setMsgs((cur) => [...cur, { id: aiId - 1, me: true, text: question }, { id: aiId, me: false, text: '', pending: true, final: null }]);
    const patch = (p: Partial<Extract<Msg, { me: false }>>) =>
      setMsgs((cur) => cur.map((m) => (m.id === aiId && !m.me ? { ...m, ...p } : m)));
    const res = await askChat(question, history, (text) => patch({ text }), data);
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
  const tries = suggestions(data);

  return (
    <div className="flex flex-wrap items-start gap-7">
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
        <div>
          <h1 className="m-0 font-heading text-3xl font-normal text-ink md:text-[40px]">Ask Stock Mover</h1>
          <p className="mt-2 mb-0 text-[17px] text-muted">Ask in your own words. Answers use only today's list, and every number is checked.</p>
        </div>
        {practice && (
          <Banner tone="warn" title="Practice answers.">The Ask service is not running on this computer, so these answers are made up from the sample list to show the screen.</Banner>
        )}
        <Card className="flex flex-col gap-6">
          {msgs.length === 0 ? (
            <div className="flex flex-col gap-3">
              <p className="m-0 font-heading text-xl text-brown">What would you like to know about today's list?</p>
              {tries.map((t) => (
                <button key={t} type="button" onClick={() => void send(t)} disabled={busy}
                  className="min-h-14 rounded-xl bg-tint px-5 py-3 text-left text-[17px] font-medium text-brown hover:bg-cta-bg disabled:opacity-50">
                  {t}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-6" aria-live="polite">
              {msgs.map((m) =>
                m.me ? (
                  <div key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-brown px-[18px] py-3.5 text-base leading-normal text-page md:max-w-[78%]">
                    {m.text}
                  </div>
                ) : (
                  <div key={m.id} className="flex max-w-[92%] flex-col gap-2 md:max-w-[86%]">
                    <div className="rounded-2xl rounded-bl-sm bg-tint px-5 py-4 text-base leading-relaxed whitespace-pre-wrap text-ink">
                      {m.pending && !m.text ? <TypingDots /> : <AnswerText text={m.text} m={data} />}
                    </div>
                    {!m.pending && <StatusLine final={m.final} />}
                  </div>
                ),
              )}
              <div ref={endRef} />
            </div>
          )}
          <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3 border-t border-line pt-5">
            <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
              <label htmlFor="ask-input" className="text-sm font-semibold">Your question</label>
              <input id="ask-input" type="text" value={input} maxLength={MAX_QUESTION} disabled={busy}
                onChange={(e) => setInput(e.target.value)} placeholder="Type a question about today's list"
                className="h-14 rounded-xl border-[1.5px] border-[#D9C49C] bg-[#FFFDF8] px-[18px] text-[17px] text-ink disabled:opacity-60" />
            </div>
            <Button type="submit" disabled={busy || !input.trim()} className="h-14 px-7">{busy ? 'Asking…' : 'Ask'}</Button>
          </form>
        </Card>
      </main>
      <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-5 xl:pt-[92px]">
        {msgs.length > 0 && tries.length > 0 && (
          <Card className="flex flex-col gap-3" padded={false}>
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
        <div className="rounded-2xl bg-ok-bg p-6 text-[15px] leading-relaxed text-[#123D2E]">
          <div className="mb-1.5 text-base font-bold">What Ask can see</div>
          {data
            ? `Today's ${num(data.summary.moves)} moves, the ${num(data.stores.length)} stores, the ${num(data.problems.length)} problems and the rules. Nothing outside that.`
            : "Today's list, the stores, the problems and the rules. Nothing outside that."}
          {isSample && <p className="mt-2 mb-0 text-sm">Showing the sample list because today's run could not be loaded.</p>}
        </div>
      </aside>
    </div>
  );
}
