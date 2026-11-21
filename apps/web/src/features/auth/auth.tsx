import { createContext, Fragment, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import LoginPage from '../../pages/LoginPage';
import InvitePage from '../../pages/InvitePage';
import manyavarLogo from '../../assets/manyavar.png';
import type { Me } from './types';
import { readViewing, scopedUrl, writeViewing } from './viewing';

/** loading → first GET /api/me in flight; off → no auth backend yet (everyone is the super admin, no sign-in). */
type Status = 'loading' | 'out' | 'in';
type AuthApi = {
  status: Status;
  /** Signed-in user; the local super admin when sign-in is off; null when signed out. */
  me: Me | null;
  isAdmin: boolean;
  /** Super admin's Viewing choice (null = all locations). Always null for a store manager. */
  viewing: string | null;
  setViewing: (id: string | null) => void;
  /** Re-reads GET /api/me (after sign-in or accepting an invite). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthApi | null>(null);

/** Before #76: approvals stay under the old "anon" key. */

/** Only same-site paths: "/moves" yes, "//evil.com" or "https://..." no. */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}

const loginUrl = (next: string) => (next === '/' || next.startsWith('/login') ? '/login' : `/login?next=${encodeURIComponent(next)}`);
const PUBLIC_API = ['/api/me', '/api/auth/', '/api/invites/', '/api/run'];

type MeResult = { status: 'out' } | { status: 'in'; me: Me };

async function loadMe(): Promise<MeResult> {
  try {
    const r = await originalFetch('/api/me', { cache: 'no-store' });
    if (!r.ok) return { status: 'out' };
    const j = (await r.json()) as Partial<Me>;
    return j.role ? { status: 'in', me: j as Me } : { status: 'out' };
  } catch {
    return { status: 'out' };
  }
}

/**
 * One fetch wrapper for the whole app, installed before anything renders so the very first data call
 * already carries ?location= and any 401 is caught. AuthProvider keeps `live` current on every render.
 */
const originalFetch = window.fetch.bind(window);
const live = { status: 'loading' as Status, location: null as string | null, onUnauthorized: () => {} };
window.fetch = async (input, init) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const scoped = scopedUrl(raw, live.location);
  const req = scoped ? (typeof input === 'string' || input instanceof URL ? scoped : new Request(scoped, input)) : input;
  const res = await originalFetch(req, init);
  if (res.status === 401 && live.status === 'in') {
    const url = new URL(raw, window.location.href);
    if (url.origin === window.location.origin && url.pathname.startsWith('/api/') && !PUBLIC_API.some((p) => url.pathname.startsWith(p))) {
      live.onUnauthorized();
    }
  }
  return res;
};

/** Shown while GET /api/me is in flight, so a page load never flashes blank. */
function Loading() {
  return (
    <div role="status" aria-label="Loading" className="flex min-h-screen items-center justify-center bg-page font-body text-ink">
      <img src={manyavarLogo} alt="Manyavar" width={319} height={77} className="block h-10 w-auto animate-pulse" />
    </div>
  );
}

/**
 * Asks GET /api/me on load and again on every page change (a turned-off user lands on Sign in at their next click).
 * Signed out: only /login and /invite render, so no protected call is made before sign-in.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [viewingRaw, setViewingRaw] = useState<string | null>(readViewing);
  const { pathname, search } = useLocation();
  const [params] = useSearchParams();

  const apply = useCallback((r: MeResult) => {
    setStatus(r.status);
    setMe(r.status === 'in' ? r.me : null);
  }, []);
  const refresh = useCallback(() => loadMe().then(apply), [apply]);
  const signedOut = useCallback(() => { live.status = 'out'; setMe(null); setStatus('out'); }, []);

  useEffect(() => {
    if (pathname === '/invite') return;
    let alive = true;
    loadMe().then((r) => {
      if (!alive) return;
      // Already signed in: only react to losing the session, so pages don't re-render on every click.
      if (live.status === 'in' && r.status === 'in') return;
      apply(r);
    });
    return () => { alive = false; };
  }, [pathname, apply]);

  const signOut = useCallback(async () => {
    await originalFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    signedOut();
  }, [signedOut]);

  const setViewing = useCallback((id: string | null) => { writeViewing(id); setViewingRaw(id); }, []);

  const isAdmin = me?.role === 'super_admin';
  const viewing = isAdmin ? viewingRaw : null;
  live.status = status;
  live.location = viewing;
  live.onUnauthorized = signedOut;

  const api: AuthApi = { status, me, isAdmin, viewing, setViewing, refresh, signOut };
  let body: ReactNode;
  if (pathname === '/invite') body = <InvitePage />;
  else if (status === 'loading') body = <Loading />;
  else if (pathname === '/login') body = status === 'in' ? <Navigate to={safeNext(params.get('next'))} replace /> : <LoginPage />;
  else if (status === 'out') body = <Navigate to={loginUrl(pathname + search)} replace />;
  // A new user or a new Viewing choice remounts the data providers, so every screen re-fetches.
  else body = <Fragment key={`${me?.id}:${viewing ?? 'all'}`}>{children}</Fragment>;
  return <Ctx.Provider value={api}>{body}</Ctx.Provider>;
}

export function useAuth(): AuthApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
