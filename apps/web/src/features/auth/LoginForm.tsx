import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { safeNext, useAuth } from './auth';

type Errors = { email?: string; password?: string; form?: string };

const WRONG = 'Email or password is wrong';

const field =
  'min-h-12 w-full rounded-xl border border-line bg-white px-4 text-base text-ink outline-none focus:border-cta focus:ring-2 focus:ring-cta-bg disabled:bg-page disabled:text-muted';

export function LoginForm() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Wrong details: focus the (now cleared and re-enabled) password field.
  useEffect(() => {
    if (errors.form === WRONG) passwordRef.current?.focus();
  }, [errors]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const v: Errors = {};
    if (!email.trim()) v.email = 'Enter your work email';
    else if (!email.includes('@')) v.email = 'That email needs an @';
    if (!password) v.password = 'Enter your password';
    setErrors(v);
    if (v.email) return emailRef.current?.focus();
    if (v.password) return passwordRef.current?.focus();

    setBusy(true);
    let form: string | undefined;
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (r.ok) {
        await refresh();
        navigate(safeNext(params.get('next')), { replace: true });
        return;
      }
      form = r.status === 401 ? WRONG : r.status === 429 ? 'Too many tries, wait a minute' : "Can't reach Stock Mover. Try again.";
    } catch {
      form = "Can't reach Stock Mover. Try again.";
    }
    setBusy(false);
    setErrors({ form });
    if (form === WRONG) setPassword('');
  }

  return (
    <form onSubmit={submit} noValidate className="flex w-full max-w-[400px] flex-col gap-5">
      <h1 className="m-0 font-heading text-[32px] leading-tight font-normal text-brown">Sign in</h1>

      <label className="flex flex-col gap-1.5 text-sm font-bold text-ink">
        Work email
        <input
          ref={emailRef}
          type="email"
          name="email"
          autoComplete="username"
          autoFocus
          value={email}
          disabled={busy}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!errors.email}
          className={field}
        />
        {errors.email && <span className="font-medium text-danger">{errors.email}</span>}
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-bold text-ink">
        Password
        <input
          ref={passwordRef}
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          disabled={busy}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!errors.password}
          className={field}
        />
        {errors.password && <span className="font-medium text-danger">{errors.password}</span>}
      </label>

      <button
        type="submit"
        disabled={busy}
        aria-busy={busy}
        className="mt-1 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-cta px-5 text-base font-bold text-white hover:bg-burnt disabled:opacity-80"
      >
        {busy && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
        Open today's list
      </button>

      <p role="alert" aria-live="assertive" className="m-0 min-h-6 text-sm font-medium text-danger">
        {errors.form}
      </p>
    </form>
  );
}
