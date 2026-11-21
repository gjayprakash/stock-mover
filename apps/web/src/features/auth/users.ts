import type { UserRow } from '@sm/contract';
import type { ManagerRow, UserStatus } from './types';

/** The /api/users endpoints (#76). Until they exist (404) a small in-memory mock answers, so the screen still works. */
export type Invite = { user: ManagerRow; invite_url: string };
export type NewManager = { name: string; mobile: string; email: string; location_id: string };

let mock: ManagerRow[] = [];
const mockUrl = () => `${window.location.origin}/invite#mock-${crypto.randomUUID().replace(/-/g, '')}`;

class NotThere extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init && { ...init, headers: { 'Content-Type': 'application/json' } });
  if (r.status === 404) throw new NotThere();
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { error?: string; message?: string | string[] } | null;
    const m = j?.error ?? (Array.isArray(j?.message) ? j.message[0] : j?.message);
    throw new Error(m || "Can't reach Stock Mover. Try again.");
  }
  return r.status === 204 ? (undefined as T) : ((await r.json()) as T);
}

const STATUS: Record<UserRow['status'], UserStatus> = { Active: 'active', 'Invite sent': 'invited', 'Turned off': 'off' };

function normalise(u: UserRow): ManagerRow {
  return { ...u, mobile: u.mobile ?? '', status: STATUS[u.status] ?? 'invited' };
}

export async function listManagers(): Promise<{ rows: ManagerRow[]; isMock: boolean }> {
  try {
    const rows = await call<UserRow[]>('/api/users');
    return { rows: rows.map(normalise).filter((u) => u.role === 'store_manager'), isMock: false };
  } catch (e) {
    if (e instanceof NotThere) return { rows: mock, isMock: true };
    throw e;
  }
}

export async function addManager(body: NewManager): Promise<Invite> {
  try {
    const r = await call<{ user: UserRow; invite_url: string }>('/api/users', { method: 'POST', body: JSON.stringify(body) });
    return { user: normalise(r.user), invite_url: r.invite_url };
  } catch (e) {
    if (!(e instanceof NotThere)) throw e;
    if (mock.some((u) => u.email === body.email)) throw new Error('That email already has a sign-in');
    const user: ManagerRow = { id: crypto.randomUUID(), role: 'store_manager', status: 'invited', last_sign_in_at: null, ...body };
    mock = [...mock, user];
    return { user, invite_url: mockUrl() };
  }
}

export async function updateManager(id: string, patch: { location_id: string } | { active: boolean }): Promise<ManagerRow> {
  try {
    return normalise(await call<UserRow>(`/api/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }));
  } catch (e) {
    if (!(e instanceof NotThere)) throw e;
    mock = mock.map((u) => u.id !== id ? u
      : 'active' in patch ? { ...u, status: patch.active ? (u.last_sign_in_at ? 'active' : 'invited') : 'off' }
      : { ...u, ...patch });
    return mock.find((u) => u.id === id)!;
  }
}

/** A fresh single-use link; the old one stops working. */
export async function resendInvite(id: string): Promise<string> {
  try {
    return (await call<{ invite_url: string }>(`/api/users/${encodeURIComponent(id)}/invite`, { method: 'POST' })).invite_url;
  } catch (e) {
    if (e instanceof NotThere) return mockUrl();
    throw e;
  }
}
