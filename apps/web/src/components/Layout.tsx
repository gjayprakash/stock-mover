import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useMovesFile } from '../data/useMovesFile';
import { dateLong, dateShort, timeShort } from '../lib/format';

type NavItem = { to: string; label: string; icon: ReactNode; end?: boolean };

const I = (d: ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
const ICON = {
  today: I(<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />),
  moves: I(<><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>),
  stores: I(<path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6" />),
  ask: I(<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />),
  ai: I(<><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" /></>),
  run: I(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  more: I(<><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>),
};

const NAV: NavItem[] = [
  { to: '/', label: 'Today', icon: ICON.today, end: true },
  { to: '/moves', label: 'All moves', icon: ICON.moves },
  { to: '/stores', label: 'Stores', icon: ICON.stores },
  { to: '/ask', label: 'Ask', icon: ICON.ask },
  { to: '/ai', label: 'AI usage', icon: ICON.ai },
  { to: '/run', label: 'Daily run', icon: ICON.run },
];

function Logo({ small }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width={small ? 28 : 34} height={small ? 28 : 34} viewBox="0 0 34 34" aria-hidden="true">
        <rect x="1" y="1" width="32" height="32" rx="8" fill="#511D00" />
        <path d="M9 13h13m0 0-4-4m4 4-4 4M25 21H12m0 0 4-4m-4 4 4 4" fill="none" stroke="#F4A27C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={`font-heading text-ink ${small ? 'text-lg' : 'text-[22px]'}`}>Stock Mover</span>
    </div>
  );
}

function SampleBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-warn-bg px-2.5 py-0.5 text-xs font-bold text-warn" title="The API did not answer, showing built-in sample data">
      Sample data
    </span>
  );
}

function RunCard() {
  const { data } = useMovesFile();
  if (!data) return <div className="h-[68px] animate-pulse rounded-xl bg-ok-bg" />;
  const { generated_at, next_run_at, status } = data.run;
  const failed = status === 'FAILED';
  return (
    <div className={`rounded-xl px-4 py-3.5 text-sm leading-snug ${failed ? 'bg-danger-bg text-danger' : 'bg-ok-bg text-[#123D2E]'}`}>
      <span className="font-bold">
        {failed ? 'Last run failed' : status === 'RUNNING' ? 'Running now' : `Ran ${dateShort(generated_at)} at ${timeShort(generated_at)}`}
      </span>
      <br />
      Next run {dateShort(next_run_at)}, {timeShort(next_run_at)}
    </div>
  );
}

function Sidebar() {
  const { data, isSample } = useMovesFile();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-7 overflow-y-auto bg-white px-4 py-6 shadow-[1px_0_0_#EFE2C8,8px_0_24px_rgba(81,29,0,0.04)] md:flex">
      <div className="px-2"><Logo /></div>
      <div className="flex flex-col gap-2 px-2 text-sm leading-snug text-muted">
        <span>{data ? `Stock as of close ${dateLong(data.run.as_of)}` : ' '}</span>
        {isSample && <span><SampleBadge /></span>}
      </div>
      <nav aria-label="Main" className="flex flex-col gap-1">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `flex min-h-12 items-center gap-3 rounded-xl px-3.5 text-base no-underline ${isActive ? 'bg-tint font-bold text-brown' : 'font-medium text-[#4A3A2E] hover:bg-page'}`
            }
          >
            {n.icon}
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto"><RunCard /></div>
    </aside>
  );
}

function MobileHeader() {
  const { data, isSample } = useMovesFile();
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-white/95 px-4 py-3 shadow-[0_1px_0_#EFE2C8] backdrop-blur md:hidden">
      <Logo small />
      <div className="flex items-center gap-2 text-sm text-muted">
        {isSample && <SampleBadge />}
        {data && <span>{dateShort(data.run.as_of)}</span>}
      </div>
    </header>
  );
}

const TABS: NavItem[] = [
  { to: '/', label: 'Today', icon: ICON.today, end: true },
  { to: '/moves', label: 'Moves', icon: ICON.moves },
  { to: '/stores', label: 'Stores', icon: ICON.stores },
  { to: '/ask', label: 'Ask', icon: ICON.ask },
];

function TabBar() {
  const [more, setMore] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMore(false), [pathname]);
  const moreActive = pathname.startsWith('/ai') || pathname.startsWith('/run');
  const tab = (active: boolean) =>
    `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs no-underline ${active ? 'font-bold text-cta' : 'font-medium text-[#4A3A2E]'}`;
  const pill = (active: boolean) => `flex h-8 w-14 items-center justify-center rounded-full ${active ? 'bg-cta-bg' : ''}`;

  return (
    <>
      {more && (
        <>
          <button aria-label="Close menu" className="fixed inset-0 z-30 bg-black/20 md:hidden" onClick={() => setMore(false)} />
          <div className="fixed right-3 bottom-[76px] z-40 flex w-52 flex-col gap-1 rounded-2xl bg-white p-2 shadow-card md:hidden">
            {NAV.slice(4).map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `flex min-h-12 items-center gap-3 rounded-xl px-3 no-underline ${isActive ? 'bg-tint font-bold text-brown' : 'text-[#4A3A2E]'}`
                }
              >
                {n.icon}
                {n.label}
              </NavLink>
            ))}
          </div>
        </>
      )}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 flex bg-white px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_0_#EFE2C8,0_-8px_24px_rgba(81,29,0,0.06)] md:hidden"
      >
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => tab(isActive)}>
            {({ isActive }) => (
              <>
                <span className={pill(isActive)}>{t.icon}</span>
                {t.label}
              </>
            )}
          </NavLink>
        ))}
        <button className={`${tab(moreActive || more)} bg-transparent`} onClick={() => setMore((m) => !m)} aria-expanded={more}>
          <span className={pill(moreActive || more)}>{ICON.more}</span>
          More
        </button>
      </nav>
    </>
  );
}

/** Desktop: left sidebar. Under 768 px: slim header + fixed bottom tab bar. */
export function Layout() {
  return (
    <div className="flex min-h-screen bg-page font-body text-ink">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader />
        <main className="mx-auto w-full max-w-[1120px] min-w-0 px-4 pt-6 pb-28 md:px-8 md:pt-10 md:pb-16">
          <Outlet />
        </main>
      </div>
      <TabBar />
    </div>
  );
}
