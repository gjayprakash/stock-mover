import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { getDriver, parseMobile, waUrl, type Driver, type PairLink } from './api';

const POLL_MS = 5_000;
const STEPS = ['1 Who', '2 Send link', '3 Connected'] as const;
const first = (name: string) => name.trim().split(/\s+/)[0];

type Props = {
  pair: PairLink | null;
  done: Driver | null;
  busy: boolean;
  error: string | null;
  onCreate: (name: string, mobile: string) => void;
  onNewLink: (id: string) => void;
  onPaired: (d: Driver) => void;
  onRestart: () => void;
};

/** "Connect a driver's phone": 1 Who → 2 Send link (WhatsApp, waits for the tap) → 3 Connected. */
export function ConnectCard({ pair, done, busy, error, onCreate, onNewLink, onPaired, onRestart }: Props) {
  const step = done ? 2 : pair ? 1 : 0;
  return (
    <Card className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 font-heading text-[28px] font-normal">Connect a driver's phone</h2>
        <ol aria-label="Steps" className="m-0 flex list-none gap-2 p-0 text-sm font-bold">
          {STEPS.map((s, i) => (
            <li
              key={s}
              aria-current={i === step ? 'step' : undefined}
              className={`rounded-full px-3 py-1.5 ${i === step ? 'bg-brown text-page' : i < step ? 'bg-ok-bg text-[#1D5B45]' : 'bg-[#F4E8D0] text-muted'}`}
            >
              {s}
            </li>
          ))}
        </ol>
      </div>
      {done ? (
        <Connected driver={done} onRestart={onRestart} />
      ) : pair ? (
        <SendLink pair={pair} busy={busy} error={error} onNewLink={onNewLink} onPaired={onPaired} />
      ) : (
        <Who busy={busy} error={error} onCreate={onCreate} />
      )}
    </Card>
  );
}

const inputCls = (bad: boolean) =>
  `h-[52px] w-full rounded-xl border-[1.5px] bg-[#FFFDF8] px-4 text-base text-ink outline-none focus:border-cta ${bad ? 'border-danger' : 'border-[#D9C49C]'}`;

function Who({ busy, error, onCreate }: { busy: boolean; error: string | null; onCreate: Props['onCreate'] }) {
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [tried, setTried] = useState(false);
  const nameErr = tried && name.trim().length < 2 ? "Type the driver's name." : null;
  const mobileErr = tried && !parseMobile(mobile) ? 'Type a 10-digit Indian mobile number, like 98073 11426.' : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    const m = parseMobile(mobile);
    if (name.trim().length >= 2 && m) onCreate(name.trim(), m);
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="dn" className="text-sm font-semibold">Driver's name</label>
          <input id="dn" className={inputCls(!!nameErr)} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" aria-invalid={!!nameErr} />
          {nameErr && <span className="text-sm font-semibold text-danger">{nameErr}</span>}
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="dm" className="text-sm font-semibold">WhatsApp number</label>
          <input id="dm" type="tel" inputMode="tel" placeholder="+91" className={inputCls(!!mobileErr)} value={mobile} onChange={(e) => setMobile(e.target.value)} autoComplete="off" aria-invalid={!!mobileErr} />
          {mobileErr && <span className="text-sm font-semibold text-danger">{mobileErr}</span>}
        </div>
      </div>
      {error && <p role="alert" className="m-0 text-sm font-semibold text-danger">{error}</p>}
      <Button type="submit" disabled={busy} className="self-start">{busy ? 'Making the link…' : 'Make the link'}</Button>
    </form>
  );
}

/** Re-renders every second so the countdown moves. */
function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function SendLink({ pair, busy, error, onNewLink, onPaired }: { pair: PairLink; busy: boolean; error: string | null; onNewLink: Props['onNewLink']; onPaired: Props['onPaired'] }) {
  const { driver, pair_url, message } = pair;
  const now = useNow();
  const [copied, setCopied] = useState(false);
  const msLeft = driver.link_expires_at ? Date.parse(driver.link_expires_at) - now : 0;
  const expired = msLeft <= 0;

  useEffect(() => {
    if (expired) return;
    let alive = true;
    const t = setInterval(() => {
      getDriver(driver.id)
        .then((d) => alive && d.status === 'PAIRED' && onPaired(d))
        .catch(() => {}); // a missed poll is retried in 5 s
    }, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [driver.id, expired, onPaired]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pair_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      window.prompt('Copy this link', pair_url);
    }
  };

  const [hi, en, ...rest] = message.split('\n');
  return (
    <div className="grid items-start gap-7 md:grid-cols-[1.1fr_1fr]">
      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="text-sm font-bold text-muted">Message {first(driver.name)} will get</div>
        <div lang="hi" className="rounded-[4px_18px_18px_18px] bg-[#E7F6EC] px-5 py-4 text-[17px] leading-[1.7] text-[#10301F]" style={{ fontFamily: "'Noto Sans Devanagari', Figtree, sans-serif" }}>
          {hi}
          <br />
          <span lang="en" className="font-body">{en}</span>
          {rest.map((line) => (
            <span key={line}>
              <br />
              {line === pair_url ? <span className="break-all text-[#0B6B3A] underline">{line}</span> : line}
            </span>
          ))}
        </div>
        <p className="m-0 text-sm text-muted">
          The message is in Hindi and English. {first(driver.name)} picks the app language after opening the link. The link works once, for 30 minutes. Only the phone that taps it is connected.
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-3.5">
        <a
          href={waUrl(driver.mobile, message)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-[60px] items-center justify-center gap-2.5 rounded-[14px] bg-[#1D6B4F] text-lg font-bold text-white no-underline shadow-[0_6px_16px_rgba(29,107,79,0.28)] hover:bg-[#155A41]"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
          </svg>
          Open WhatsApp and send
        </a>
        <button type="button" onClick={copy} className="h-[50px] rounded-xl border-[1.5px] border-[#D9C49C] bg-white text-base font-semibold text-[#4A3A2E] hover:bg-tint">
          {copied ? 'Link copied' : 'Copy link'}
        </button>
        {expired ? (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-[14px] bg-danger-bg px-4 py-4 text-base text-danger">
            <span className="flex-1 font-semibold">This link has expired. Make a new one and send it again.</span>
            <Button size="sm" disabled={busy} onClick={() => onNewLink(driver.id)}>{busy ? 'Making…' : 'Make a new link'}</Button>
          </div>
        ) : (
          <div role="status" className="flex items-center gap-3 rounded-[14px] bg-[#FAF3E7] px-4 py-4 text-base">
            <span className="h-3.5 w-3.5 flex-none animate-pulse rounded-full bg-cta shadow-[0_0_0_6px_rgba(199,64,14,0.18)]" />
            <span className="flex-1">Waiting for {first(driver.name)} to tap the link · {Math.ceil(msLeft / 60_000)} min left</span>
          </div>
        )}
        {error && <p role="alert" className="m-0 text-sm font-semibold text-danger">{error}</p>}
      </div>
    </div>
  );
}

function Connected({ driver, onRestart }: { driver: Driver; onRestart: () => void }) {
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-ok-bg px-7 py-6 text-[#123D2E]">
      <div className="flex items-center gap-4">
        <span className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full bg-[#1D6B4F] text-white">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12l5 5 9-10" />
          </svg>
        </span>
        <div>
          <div className="font-heading text-[26px]">{first(driver.name)}'s phone is connected.</div>
          <div className="text-base">Give {first(driver.name)} a shipment from Shipments.</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Link to="/shipments" className="inline-flex h-[50px] items-center rounded-xl bg-[#1D6B4F] px-5 text-base font-semibold text-white no-underline hover:bg-[#155A41]">
          Go to shipments
        </Link>
        <button type="button" onClick={onRestart} className="h-[50px] rounded-xl border-[1.5px] border-[#9CC7B3] bg-white px-5 text-base font-semibold text-[#123D2E]">
          Connect another
        </button>
      </div>
    </div>
  );
}
