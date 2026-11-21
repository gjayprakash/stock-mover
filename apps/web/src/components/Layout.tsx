import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { useMovesFile } from '../data/useMovesFile';
import { useAuth } from '../features/auth/auth';
import { useLocations } from '../features/auth/viewing';
import { useWaitingCount } from '../features/requests/useWaitingCount';
import { dateLong, dateShort, storeLabel, timeShort } from '../lib/format';
import manyavarLogo from '../assets/manyavar.png';

type NavItem = { to: string; label: string; icon: ReactNode; end?: boolean; short?: string };

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
  addStock: I(<><path d="M3 8l9-5 9 5v8l-9 5-9-5z" /><path d="M12 9v6M9 12h6" /></>),
  addStore: I(<><path d="M4 9l1.5-5h13L20 9M4 9v11h9M4 9h16v3" /><path d="M18 15v6M15 18h6" /></>),
  requests: I(<><path d="M4 13h4l2 3h4l2-3h4" /><path d="M4 13l2.5-7h11L20 13v6H4z" /></>),
  shipments: I(<><path d="M2 7h12v9H2zM14 10h4l3 3v3h-7z" /><circle cx="6" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>),
  drivers: I(<><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18h2" /></>),
  managers: I(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.3c2.2.7 3.5 2.8 3.5 5.7" /></>),
};

const TODAY: NavItem = { to: '/', label: 'Today', icon: ICON.today, end: true };
const REQUESTS: NavItem = { to: '/requests', label: 'Requests', icon: ICON.requests };
const SHIPMENTS: NavItem = { to: '/shipments', label: 'Shipments', icon: ICON.shipments };
const DRIVERS: NavItem = { to: '/drivers', label: 'Drivers', icon: ICON.drivers };
const ASK: NavItem = { to: '/ask', label: 'Ask', icon: ICON.ask };

const ADMIN_NAV: NavItem[] = [
  TODAY,
  { to: '/moves', label: 'All moves', short: 'Moves', icon: ICON.moves },
  { to: '/stores', label: 'Stores', icon: ICON.stores },
  REQUESTS,
  SHIPMENTS,
  DRIVERS,
  { to: '/managers', label: 'Store managers', icon: ICON.managers },
  ASK,
  { to: '/ai', label: 'AI usage', icon: ICON.ai },
  { to: '/run', label: 'Daily run', icon: ICON.run },
  { to: '/add-stock', label: 'Add stock', icon: ICON.addStock },
  { to: '/add-store', label: 'Add store', icon: ICON.addStore },
];
/** A store manager: their own store only, no Add store / Daily run / AI usage. */
const MANAGER_NAV: NavItem[] = [
  TODAY,
  { to: '/moves', label: 'My moves', short: 'Moves', icon: ICON.moves },
  REQUESTS,
  SHIPMENTS,
  DRIVERS,
  ASK,
];
/** Phone tab bar; the rest of the role's links sit under More. */
const ADMIN_TABS = ['/', '/moves', '/stores', '/ask'];
const MANAGER_TABS = ['/', '/moves', '/requests', '/ask'];

function useNav() {
  const admin = useAuth().isAdmin;
  const nav = admin ? ADMIN_NAV : MANAGER_NAV;
  const tabs = admin ? ADMIN_TABS : MANAGER_TABS;
  return { nav, tabs: nav.filter((n) => tabs.includes(n.to)), rest: nav.filter((n) => !tabs.includes(n.to)) };
}

/** The Manyavar wordmark (cropped from the brand logo Asjad supplied). Intrinsic size 319 × 77. */
function Logo({ small }: { small?: boolean }) {
  return <img src={manyavarLogo} alt="Manyavar" width={319} height={77} className={`block w-auto ${small ? 'h-7' : 'h-10'}`} />;
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

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

/** Only when sign-in is on and someone is signed in. */
function UserCard() {
  const { status, me, signOut } = useAuth();
  if (status !== 'in' || !me) return null;
  return (
    <div className="flex items-center gap-3 px-2 pt-3">
      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brown text-[13px] font-bold text-page">{initials(me.name || me.email)}</span>
      <span className="flex min-w-0 flex-col text-[15px] leading-snug">
        <span className="truncate font-semibold text-ink" title={me.email}>{me.name || me.email}</span>
        <button className="self-start bg-transparent p-0 text-left text-[#4A3A2E] hover:text-cta" onClick={signOut}>Sign out</button>
      </span>
    </div>
  );
}

/** Super admin: look at every location or one store. Every API call then carries ?location=. */
function ViewingPicker() {
  const { isAdmin, viewing, setViewing } = useAuth();
  const locations = useLocations();
  if (!isAdmin) return null;
  return (
    <label className="flex flex-col gap-1.5 px-2 text-[13px] font-bold text-muted">
      Viewing
      <select
        value={viewing ?? ''}
        onChange={(e) => setViewing(e.target.value || null)}
        className="min-h-11 rounded-[10px] border-[1.5px] border-[#D9C49C] bg-[#FFFDF8] px-2.5 text-[15px] font-normal text-ink"
      >
        <option value="">All locations ({locations.length})</option>
        {locations.map((l) => <option key={l.store_id} value={l.store_id}>{storeLabel(l)}</option>)}
      </select>
    </label>
  );
}

function YourStore() {
  const { me, isAdmin } = useAuth();
  const locations = useLocations();
  if (isAdmin || !me?.location_id) return null;
  return (
    <div className="mx-2 rounded-xl bg-tint px-3.5 py-3 text-sm leading-snug text-brown">
      <span className="block text-xs font-bold text-[#6B4A33]">Your store</span>
      <span className="text-base font-bold">{storeLabel(me.location_id, locations)}</span>
    </div>
  );
}

function Sidebar() {
  const { data, isSample } = useMovesFile();
  const { nav } = useNav();
  const { isAdmin } = useAuth();
  const waiting = useWaitingCount();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col gap-7 overflow-y-auto overscroll-contain bg-white px-4 py-6 shadow-[1px_0_0_#EFE2C8,8px_0_24px_rgba(81,29,0,0.04)] md:flex">
      <div className="px-2"><Logo /></div>
      <div className="flex flex-col gap-2 px-2 text-sm leading-snug text-muted">
        <span>{data ? `Stock as of close ${dateLong(data.run.as_of)}` : ' '}</span>
        {isSample && <span><SampleBadge /></span>}
      </div>
      <ViewingPicker />
      <YourStore />
      <nav aria-label="Main" className="flex flex-col gap-1">
        {nav.map((n) => (
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
            {n.to === '/requests' && waiting > 0 && (
              <span className="ml-auto rounded-full bg-cta px-2 py-0.5 text-xs font-bold text-white" aria-label={`${waiting} waiting for you`}>{waiting}</span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto">{isAdmin && <RunCard />}<UserCard /></div>
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

function TabBar() {
  const [more, setMore] = useState(false);
  const { pathname } = useLocation();
  const { tabs, rest } = useNav();
  useEffect(() => setMore(false), [pathname]);
  const moreActive = rest.some((n) => pathname.startsWith(n.to));
  const tab = (active: boolean) =>
    `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs no-underline ${active ? 'font-bold text-cta' : 'font-medium text-[#4A3A2E]'}`;
  const pill = (active: boolean) => `flex h-8 w-14 items-center justify-center rounded-full ${active ? 'bg-cta-bg' : ''}`;

  return (
    <>
      {more && (
        <>
          <button aria-label="Close menu" className="fixed inset-0 z-30 bg-black/20 md:hidden" onClick={() => setMore(false)} />
          <div className="fixed right-3 bottom-[76px] z-40 flex w-52 flex-col gap-1 rounded-2xl bg-white p-2 shadow-card md:hidden">
            <ViewingPicker />
            <YourStore />
            {rest.map((n) => (
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
            <UserCard />
          </div>
        </>
      )}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 flex bg-white px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_0_#EFE2C8,0_-8px_24px_rgba(81,29,0,0.06)] md:hidden"
      >
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => tab(isActive)}>
            {({ isActive }) => (
              <>
                <span className={pill(isActive)}>{t.icon}</span>
                {t.short ?? t.label}
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

/** New screen -> back to the top. `/moves?move=<id>` scrolls to its own row, so leave that alone. */
function ScrollToTop() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const deepLink = pathname === '/moves' && params.has('move');
  useEffect(() => {
    if (!deepLink) window.scrollTo(0, 0);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Desktop: fixed left sidebar, only the main column scrolls. Under 768 px: slim header + fixed bottom tab bar. */
export function Layout() {
  // Ask is a chat: it fills exactly one window height and scrolls inside its own card, never the page.
  const fullHeight = useLocation().pathname === '/ask';
  return (
    <div className="min-h-screen bg-page font-body text-ink">
      <ScrollToTop />
      <Sidebar />
      <div className={`flex min-w-0 flex-col md:pl-60 ${fullHeight ? 'h-dvh' : ''}`}>
        <MobileHeader />
        <main
          className={`mx-auto w-full max-w-[1200px] min-w-0 px-4 pt-6 md:px-8 md:pt-10 xl:px-10 ${
            fullHeight ? 'flex min-h-0 flex-1 flex-col pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-8' : 'pb-28 md:pb-16'
          }`}
        >
          <Outlet />
        </main>
      </div>
      <TabBar />
    </div>
  );
}
