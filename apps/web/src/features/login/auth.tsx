import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import LoginPage from '../../pages/LoginPage';

/** loading → first GET /api/me in flight; off → sign-in not configured (app behaves as before). */
type Status = 'loading' | 'off' | 'out' | 'in';
type AuthApi = {
  status: Status;
  /** Signed-in email; null when sign-in is off or nobody is signed in. */
  email: string | null;
  signedIn: (email: string) => void;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthApi | null>(null);

/** Only same-site paths: "/moves" yes, "//evil.com" or "https://..." no. */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}

const loginUrl = (next: string) => (next === '/' || next.startsWith('/login') ? '/login' : `/login?next=${encodeURIComponent(next)}`);
const PUBLIC_API = ['/api/me', '/api/auth/', '/api/run'];

/** Shown while GET /api/me is in flight, so a page load never flashes blank. */
function Loading() {
  return (
    <div role="status" aria-label="Loading Stock Mover" className="flex min-h-screen items-center justify-center bg-page font-body text-ink">
      <div className="flex animate-pulse items-center gap-2.5">
        <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
          <rect x="1" y="1" width="32" height="32" rx="8" fill="#511D00" />
          <path d="M9 13h13m0 0-4-4m4 4-4 4M25 21H12m0 0 4-4m-4 4 4 4" fill="none" stroke="#F4A27C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="font-heading text-[22px]">Stock Mover</span>
      </div>
    </div>
  );
}

/**
 * Asks GET /api/me once. Sign-in off: renders children untouched. Signed out: only /login renders,
 * so no protected call is made before sign-in. Any later 401 from /api/* sends the user back to /login.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const { pathname, search } = useLocation();
  const [params] = useSearchParams();
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    let alive = true;
    fetch('/api/me', { cache: 'no-store' })
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 401) return setStatus('out');
        const me = (await r.json()) as { enabled: boolean; email: string | null };
        if (!me.enabled) return setStatus('off');
        setEmail(me.email);
        setStatus('in');
      })
      // API unreachable: behave as today (screens fall back to sample data). A protected API answers 401 instead.
      .catch(() => alive && setStatus('off'));
    return () => { alive = false; };
  }, []);

  // Session expired mid-use: the first 401 from a protected /api/ call goes to /login?next=<page>.
  useEffect(() => {
    if (status !== 'in') return;
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const res = await original(input, init);
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href);
      const isPublic = PUBLIC_API.some((p) => url.pathname.startsWith(p));
      if (res.status === 401 && url.origin === window.location.origin && url.pathname.startsWith('/api/') && !isPublic && statusRef.current === 'in') {
        // Once only, even when several calls fail together; the render below redirects with next=<this page>.
        statusRef.current = 'out';
        setEmail(null);
        setStatus('out');
      }
      return res;
    };
    return () => { window.fetch = original; };
  }, [status]);

  const signedIn = useCallback((e: string) => { setEmail(e); setStatus('in'); }, []);
  // The render below then sends the user to /login?next=<this page>.
  const signOut = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    statusRef.current = 'out';
    setEmail(null);
    setStatus('out');
  }, []);

  const api: AuthApi = { status, email, signedIn, signOut };
  let body: ReactNode;
  if (status === 'loading') body = <Loading />;
  else if (status === 'off') body = children;
  else if (pathname === '/login') body = status === 'in' ? <Navigate to={safeNext(params.get('next'))} replace /> : <LoginPage />;
  else body = status === 'in' ? children : <Navigate to={loginUrl(pathname + search)} replace />;
  return <Ctx.Provider value={api}>{body}</Ctx.Provider>;
}

export function useAuth(): AuthApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
