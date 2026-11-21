import type { NewUserRequest, NewUserResponse, UserPatch, UserRow } from '@sm/contract';
import type { PersonRow, UserStatus } from './types';

/** The /api/users endpoints (#76). Until they exist (404) a small in-memory mock answers, so the screen still works. */
export type Invite = { user: PersonRow; invite_url: string };
export type NewPerson = NewUserRequest;

let mock: PersonRow[] = [];
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

function normalise(u: UserRow): PersonRow {
  return { ...u, mobile: u.mobile ?? '', status: STATUS[u.status] ?? 'invited' };
}

/** Everyone: super admins and store managers. */
export async function listPeople(): Promise<{ rows: PersonRow[]; isMock: boolean }> {
  try {
    const rows = await call<UserRow[]>('/api/users');
    return { rows: rows.map(normalise), isMock: false };
  } catch (e) {
    if (e instanceof NotThere) return { rows: mock, isMock: true };
    throw e;
  }
}

/** Mirrors the server: one email, one role. */
function mockTaken(email: string): string | null {
  const u = mock.find((m) => m.email === email);
  if (!u) return null;
  return u.role === 'super_admin' ? 'That email is already a super admin' : `That email is already a store manager for ${u.location_id}`;
}

export async function addPerson(body: NewPerson): Promise<Invite> {
  const email = body.email.trim().toLowerCase();
  const role = body.role ?? 'store_manager';
  const clean: NewPerson = {
    email,
    role,
    ...(role === 'store_manager' ? { location_id: body.location_id } : {}),
    ...(body.name?.trim() ? { name: body.name.trim() } : {}),
    ...(body.mobile?.trim() ? { mobile: body.mobile.trim() } : {}),
  };
  try {
    const r = await call<NewUserResponse>('/api/users', { method: 'POST', body: JSON.stringify(clean) });
    return { user: normalise(r.user), invite_url: r.invite_url };
  } catch (e) {
    if (!(e instanceof NotThere)) throw e;
    const taken = mockTaken(email);
    if (taken) throw new Error(taken);
    const user: PersonRow = {
      id: crypto.randomUUID(), role, status: 'invited', last_sign_in_at: null, email,
      name: clean.name ?? email.split('@')[0], mobile: clean.mobile ?? '',
      location_id: role === 'store_manager' ? clean.location_id ?? null : null,
    };
    mock = [...mock, user];
    return { user, invite_url: mockUrl() };
  }
}

export async function updatePerson(id: string, patch: UserPatch, myId?: string): Promise<PersonRow> {
  try {
    return normalise(await call<UserRow>(`/api/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }));
  } catch (e) {
    if (!(e instanceof NotThere)) throw e;
    if ('active' in patch && !patch.active) {
      const t = mock.find((u) => u.id === id);
      if (id === myId) throw new Error('You cannot turn yourself off');
      if (t?.role === 'super_admin' && !mock.some((u) => u.id !== id && u.role === 'super_admin' && u.status !== 'off')) {
        throw new Error('This is the last active super admin. Add or turn on another super admin first.');
      }
    }
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
