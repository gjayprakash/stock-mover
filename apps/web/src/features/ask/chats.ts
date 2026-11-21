import type { ChatFinal, ChatStep } from './chatClient';
import type { Tag } from './tags';

/** One message of a chat. `note` lines are the screen's own (e.g. "continued on a newer list"), never sent to the server. */
export type Msg =
  | { id: number; me: true; text: string; tags: Tag[] }
  | { id: number; me: false; text: string; pending: boolean; final: ChatFinal | null; sentTags: Tag[]; steps: ChatStep[] }
  | { id: number; note: true; me?: undefined; text: string };
export type AiMsg = Extract<Msg, { me: false }>;

export type Chat = {
  id: string;
  /** From the first question. */
  title: string;
  createdAt: string;
  updatedAt: string;
  /** The list (run) the chat was started on, and the one its latest answer used. */
  runId: string | null;
  runAt: string | null;
  lastRunId: string | null;
  msgs: Msg[];
};

export const MAX_CHATS = 30;
export const MAX_MSGS = 60;
const TITLE = 70;

/** Same user part as approvals: the signed-in user (here by email), or "anon" when sign-in is off. */
const keyFor = (user: string) => `sm-chats:${user}`;

export function loadChats(user: string): Chat[] {
  try {
    const raw = localStorage.getItem(keyFor(user));
    const v = raw ? (JSON.parse(raw) as Chat[]) : [];
    if (!Array.isArray(v)) return [];
    // An answer that was still streaming when the page closed is shown as not answered.
    return v
      .filter((c) => c && typeof c.id === 'string' && Array.isArray(c.msgs))
      .map((c) => ({ ...c, msgs: c.msgs.map((m) => (m.me === false && m.pending ? { ...m, pending: false } : m)) }));
  } catch {
    return [];
  }
}

/** Newest first, at most MAX_CHATS chats of MAX_MSGS messages (oldest dropped). Empty chats are not kept. */
export function saveChats(user: string, chats: Chat[]) {
  const keep = chats
    .filter((c) => c.msgs.length > 0)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_CHATS)
    .map((c) => (c.msgs.length > MAX_MSGS ? { ...c, msgs: c.msgs.slice(-MAX_MSGS) } : c));
  try {
    localStorage.setItem(keyFor(user), JSON.stringify(keep));
  } catch {
    // Storage full or blocked: try once with half the chats, else keep them in memory only.
    try { localStorage.setItem(keyFor(user), JSON.stringify(keep.slice(0, Math.ceil(keep.length / 2)))); } catch { /* memory only */ }
  }
}

export function newChat(runId: string | null, runAt: string | null): Chat {
  const now = new Date().toISOString();
  return { id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: '', createdAt: now, updatedAt: now, runId, runAt, lastRunId: runId, msgs: [] };
}

export const titleFrom = (q: string) => (q.length > TITLE ? q.slice(0, TITLE - 1).trimEnd() + '…' : q);

/** Next message id inside a chat. */
export const nextMsgId = (c: Chat) => c.msgs.reduce((m, x) => Math.max(m, x.id), 0) + 1;
