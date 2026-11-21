import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './auth';

const field =
  'min-h-12 w-full rounded-xl border border-line bg-white px-4 text-base text-ink outline-none focus:border-cta focus:ring-2 focus:ring-cta-bg disabled:bg-page disabled:text-muted';
const MIN = 8;

/** Token comes from the URL fragment, which never reaches a server log. */
export function InviteForm() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [token] = useState(() => window.location.hash.slice(1));
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const firstRef = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password.length < MIN) { setError(`Use at least ${MIN} characters`); return firstRef.current?.focus(); }
    if (password !== again) { setError('The two passwords are not the same'); return; }
    setBusy(true);
    setError(undefined);
    try {
      const r = await fetch('/api/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      // 404: no auth backend yet (#76), nothing to accept; go straight to Today.
      if (r.ok || r.status === 404) {
        history.replaceState(null, '', '/invite'); // drop the used token from the address bar
        await refresh();
        navigate('/', { replace: true });
        return;
      }
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      setError(r.status === 400 ? j?.error ?? 'This link has expired or was already used. Ask for a new one.' : "Can't reach Stock Mover. Try again.");
    } catch {
      setError("Can't reach Stock Mover. Try again.");
    }
    setBusy(false);
  }

  if (!token) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="m-0 font-heading text-[32px] leading-tight font-normal text-brown">This link is incomplete</h1>
        <p className="m-0 text-base text-muted">Open the full link from your WhatsApp message, or ask for a new one.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex w-full max-w-[400px] flex-col gap-5">
      <div>
        <h1 className="m-0 font-heading text-[32px] leading-tight font-normal text-brown">Set your password</h1>
        <p className="mt-2 mb-0 text-base text-muted">You will use it with your work email to sign in.</p>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-bold text-ink">
        New password
        <input ref={firstRef} type="password" autoComplete="new-password" autoFocus value={password} disabled={busy}
          onChange={(e) => setPassword(e.target.value)} className={field} />
        <span className="font-medium text-muted">At least {MIN} characters.</span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold text-ink">
        Type it again
        <input type="password" autoComplete="new-password" value={again} disabled={busy}
          onChange={(e) => setAgain(e.target.value)} className={field} />
      </label>
      <button type="submit" disabled={busy} aria-busy={busy}
        className="mt-1 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-cta px-5 text-base font-bold text-white hover:bg-burnt disabled:opacity-80">
        {busy && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
        Set password and open today's list
      </button>
      <p role="alert" aria-live="assertive" className="m-0 min-h-6 text-sm font-medium text-danger">{error}</p>
    </form>
  );
}
