import { useCallback, useEffect, useState } from 'react';
import { driverApi, flushPings, sendPing, Unpaired, type DriverMe, type DriverTrip } from './api';
import { BigButton, Header, Page, initials, speak, useLang } from './shell';
import { INSTALL_HINT_KEY } from './JoinScreen';
import {
  AllowPicture, ArrowDown, Back, Box, BoxTick, Call, Camera, Clock, Cross, EmptyTruckPicture, Flag, Link,
  LocationSwitchPicture, Pin, Shop, Tick, Truck, Wifi,
} from './icons';

type View = 'trip' | 'sent' | 'deliver' | 'done';
type Loc = null | 'ask' | 'off' | 'fail' | 'queued' | 'net';
const ASKED_KEY = 'sm.driver.locAsked';

// Chrome fires this once the page is installable; we keep it for the "Add to home screen" button.
type InstallEvent = Event & { prompt: () => Promise<void> };
let installEvent: InstallEvent | null = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e as InstallEvent; });

function position(): Promise<GeolocationPosition> {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej({ code: 2 });
    navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}

/** /driver: today's trip, send my location, delivered. */
export function DriverHome() {
  const { lang, t, adoptServerLang } = useLang();
  const [me, setMe] = useState<DriverMe | null>(null);
  const [trip, setTrip] = useState<DriverTrip | null | undefined>(undefined);
  const [problem, setProblem] = useState<null | 'unpaired' | 'offline'>(null);
  const [view, setView] = useState<View>('trip');
  const [loc, setLoc] = useState<Loc>(null);
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<string | undefined>();
  const [, tick] = useState(0);
  const [hint, setHint] = useState(() => { try { return localStorage.getItem(INSTALL_HINT_KEY) === '1'; } catch { return false; } });

  const load = useCallback(async () => {
    try {
      const [m, tr] = await Promise.all([driverApi.me(), driverApi.trip()]);
      setMe(m);
      adoptServerLang(m.lang);
      setTrip(tr);
      setProblem(null);
    } catch (e) {
      setProblem(e instanceof Unpaired ? 'unpaired' : 'offline');
    }
  }, [adoptServerLang]);

  useEffect(() => {
    load();
    flushPings();
    const online = () => { flushPings(); load(); };
    const visible = () => { if (document.visibilityState === 'visible') load(); };
    const every = window.setInterval(() => tick((n) => n + 1), 30_000);
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', visible);
    return () => { window.clearInterval(every); window.removeEventListener('online', online); document.removeEventListener('visibilitychange', visible); };
  }, [load]);

  // Location sent / delivered screens go back on their own after 3 s.
  useEffect(() => {
    if (view !== 'sent' && view !== 'done') return;
    const id = window.setTimeout(() => { setView('trip'); if (view === 'done') load(); }, 3000);
    return () => window.clearTimeout(id);
  }, [view, load]);

  useEffect(() => { if (loc === 'off') speak([t.locOff], lang); }, [loc, lang, t]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { if (e instanceof Unpaired) setProblem('unpaired'); else setLoc('net'); } finally { setBusy(false); }
  };

  const pickedUp = () => act(async () => { await driverApi.pickedUp(); setTrip((x) => x && { ...x, status: 'in_transit' }); setLoc(null); });

  const doSend = () => act(async () => {
    setLoc(null);
    let p: GeolocationPosition;
    try { p = await position(); } catch (e) { setLoc((e as GeolocationPositionError).code === 3 ? 'fail' : 'off'); return; }
    const ping = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, taken_at: new Date(p.timestamp || Date.now()).toISOString() };
    const sent = await sendPing(ping);
    setTrip((x) => x && { ...x, last_ping_at: ping.taken_at });
    if (sent) setView('sent'); else setLoc('queued');
  });

  // First use: show which button to press before Chrome asks.
  const send = async () => {
    let asked = false;
    try { asked = localStorage.getItem(ASKED_KEY) === '1'; } catch { /* ignore */ }
    const state = await navigator.permissions?.query({ name: 'geolocation' }).then((s) => s.state).catch(() => 'prompt');
    if (!asked && state !== 'granted') { setLoc('ask'); return; }
    doSend();
  };
  const okAsk = () => { try { localStorage.setItem(ASKED_KEY, '1'); } catch { /* ignore */ } doSend(); };

  const delivered = () => act(async () => { await driverApi.delivered(photo); setPhoto(undefined); setView('done'); });

  const call = me?.manager_phone || trip?.manager_phone;
  const callBtn = call ? <BigButton tone="plain" h={62} href={`tel:${call}`}><Call size={28} />{t.call}</BigButton> : null;

  if (problem) {
    const unpaired = problem === 'unpaired';
    return (
      <Page>
        <Header lines={[unpaired ? t.notPaired : t.noSignal]} />
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <span className="flex h-[132px] w-[132px] items-center justify-center rounded-[32px] bg-white text-[#511D00] shadow-[0_8px_22px_rgba(81,29,0,0.12)]">
            {unpaired ? <Link size={80} stroke={1.5} /> : <Wifi size={80} stroke={1.5} />}
          </span>
          <div className="text-[28px] font-bold leading-snug">{unpaired ? t.notPaired : t.noSignal}</div>
        </div>
        {!unpaired && <BigButton tone="orange" h={80} onClick={load}>{t.retry}</BigButton>}
      </Page>
    );
  }

  if (trip === undefined) {
    return <Page><Header lines={[]} /><div className="flex flex-1 items-center justify-center text-[#C7400E]"><Truck size={72} stroke={1.6} className="animate-pulse" /></div></Page>;
  }

  if (view === 'sent' || view === 'done') {
    const sent = view === 'sent';
    return (
      <Page bg="#E4F1EA">
        <Header lines={sent ? [t.sent, t.again] : [t.done]} onColor="#1D6B4F" onText="#FFFFFF" offText="#123D2E" />
        <div role="status" className="flex flex-1 flex-col items-center justify-center gap-[22px] text-center text-[#123D2E]">
          <span className="flex h-44 w-44 items-center justify-center rounded-full bg-[#1D6B4F] text-white shadow-[0_0_0_18px_rgba(29,107,79,0.16)]"><Tick size={104} stroke={2.6} /></span>
          <div className="text-[38px] font-bold leading-tight">{sent ? t.sent : t.done}</div>
          {sent && (
            <div className="flex items-center gap-4 rounded-[20px] bg-white px-5 py-4">
              <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
                <circle cx="32" cy="32" r="27" fill="none" stroke="#CFE6DA" strokeWidth="7" />
                <circle cx="32" cy="32" r="27" fill="none" stroke="#1D6B4F" strokeWidth="7" strokeLinecap="round" strokeDasharray="170 170" transform="rotate(-90 32 32)" />
                <text x="32" y="38" textAnchor="middle" fontFamily="Figtree, sans-serif" fontSize="18" fontWeight="800" fill="#123D2E">1</text>
              </svg>
              <div className="whitespace-pre-line text-left text-[21px] font-semibold leading-snug">{t.again}</div>
            </div>
          )}
        </div>
        <button type="button" onClick={() => { setView('trip'); if (!sent) load(); }}
          className="flex h-20 items-center justify-center gap-3 rounded-[20px] border-2 border-[#9CC7B3] bg-white text-[26px] font-bold text-[#123D2E]">
          <Back size={32} stroke={2.2} />{t.back}
        </button>
      </Page>
    );
  }

  if (!trip) {
    return (
      <Page>
        <Header lines={[t.noTrip, t.call]} />
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <EmptyTruckPicture />
          <div className="text-[30px] font-bold leading-snug">{t.noTrip}</div>
        </div>
        {callBtn}
      </Page>
    );
  }

  const from = `${trip.from_store_name} · ${trip.from_store_id}`;
  const to = `${trip.to_store_name} · ${trip.to_store_id}`;

  if (view === 'deliver') {
    return (
      <Page>
        <Header lines={[t.deliveredQ, trip.to_store_name, `${trip.pieces} ${t.pcs}`, t.yes, t.no]} />
        <div className="flex flex-1 flex-col items-center justify-center gap-[18px] text-center">
          <span className="flex h-[132px] w-[132px] items-center justify-center rounded-[32px] bg-white text-[#511D00] shadow-[0_8px_22px_rgba(81,29,0,0.12)]"><Box size={80} stroke={1.5} /></span>
          <div className="text-[32px] font-bold leading-tight">{t.deliveredQ}</div>
          <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl bg-white px-[18px] py-3 text-[19px]">
            <span className="font-bold">{trip.to_store_name}</span>
            <span className="text-[#5E4E42]" style={{ fontFamily: 'Figtree, sans-serif' }}>{trip.to_store_id}</span>
            <span className="text-2xl font-extrabold" style={{ fontFamily: 'Figtree, sans-serif' }}>{trip.pieces}</span>
            <span>{t.pcs}</span>
          </div>
          <label className="flex h-16 cursor-pointer items-center gap-3 rounded-[18px] border-2 border-dashed px-[26px] text-[21px] font-semibold"
            style={{ borderColor: photo ? '#1D6B4F' : '#B79C74', color: photo ? '#1D5B45' : '#4A3A2E', background: photo ? '#E4F1EA' : 'transparent' }}>
            {photo ? <Tick size={30} /> : <Camera size={30} />}{photo ? t.photoTaken : t.photo}
            <input type="file" accept="image/*" capture="environment" className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) shrink(f).then(setPhoto).catch(() => undefined); }} />
          </label>
        </div>
        {loc && loc !== 'ask' && <Notice loc={loc} />}
        <div className="flex flex-col gap-3">
          <BigButton tone="green" onClick={delivered} disabled={busy}><Tick size={44} stroke={2.8} />{t.yes}</BigButton>
          <BigButton tone="plain" h={76} onClick={() => { setView('trip'); setLoc(null); }}><Cross size={34} stroke={2.6} />{t.no}</BigButton>
        </div>
      </Page>
    );
  }

  const picked = trip.status === 'in_transit';
  const mins = trip.last_ping_at ? Math.max(0, Math.round((Date.now() - Date.parse(trip.last_ping_at)) / 60000)) : null;
  const last = mins === null ? t.neverSent : t.lastSent(t.ago(mins));
  const name = me?.name ?? '';

  return (
    <Page>
      <Header lines={picked
        ? [t.hello(name), t.pickedHere, trip.from_store_name, t.dropHere, trip.to_store_name, `${trip.pieces} ${t.pcs}`, t.send, last, t.delivered]
        : [t.hello(name), t.pickHere, trip.from_store_name, t.dropHere, trip.to_store_name, `${trip.pieces} ${t.pcs}`, t.pickedUp]} />
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F8ECD7] text-sm font-extrabold text-[#511D00]" style={{ fontFamily: 'Figtree, sans-serif' }} aria-hidden="true">{initials(name)}</span>
        <span className="text-[22px] font-bold">{t.hello(name)}</span>
      </div>

      {hint && (
        <div className="flex items-center gap-2 rounded-2xl bg-white p-2 pl-3 shadow-[0_1px_2px_rgba(81,29,0,0.06)]">
          {installEvent ? (
            <button type="button" className="flex h-12 flex-1 items-center gap-2 rounded-xl bg-[#511D00] px-3 text-base font-bold text-white"
              onClick={() => { installEvent?.prompt(); installEvent = null; setHint(false); try { localStorage.removeItem(INSTALL_HINT_KEY); } catch { /* ignore */ } }}>
              <Truck size={26} />{t.install}
            </button>
          ) : (
            <span className="flex flex-1 items-center gap-2 text-base font-semibold text-[#4A3A2E]"><Truck size={26} />{t.installHint}</span>
          )}
          <button type="button" aria-label={t.close} className="flex h-12 w-12 items-center justify-center rounded-xl text-[#4A3A2E]"
            onClick={() => { setHint(false); try { localStorage.removeItem(INSTALL_HINT_KEY); } catch { /* ignore */ } }}>
            <Cross size={24} />
          </button>
        </div>
      )}

      <section aria-label={t.trip} className="flex flex-col gap-1">
        <div className="flex items-center gap-3.5 rounded-[18px] bg-white px-4 py-3"
          style={picked ? { boxShadow: '0 1px 2px rgba(81,29,0,0.06)' } : { border: '3px solid #C7400E' }}>
          <span className={`flex h-[54px] w-[54px] flex-none items-center justify-center rounded-2xl ${picked ? 'bg-[#E4F1EA] text-[#1D6B4F]' : 'bg-[#FDE9DD] text-[#C7400E]'}`}>
            {picked ? <Tick size={30} stroke={2.4} /> : <Shop size={30} stroke={2.2} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className={`text-[15px] font-semibold ${picked ? 'text-[#1D5B45]' : 'text-[#8A2C07]'}`}>{picked ? t.pickedHere : t.pickHere}</div>
            <div className="text-xl font-bold leading-snug">{from}</div>
          </div>
          {!picked && <Pieces n={trip.pieces} />}
        </div>
        <div className="flex justify-center text-[#8C6A4F]" aria-hidden="true"><ArrowDown size={22} stroke={3} /></div>
        <div className="flex items-center gap-3.5 rounded-[18px] bg-white px-4 py-3" style={picked ? { border: '3px solid #C7400E' } : { boxShadow: '0 1px 2px rgba(81,29,0,0.06)' }}>
          <span className="flex h-[54px] w-[54px] flex-none items-center justify-center rounded-2xl bg-[#FDE9DD] text-[#C7400E]"><Flag size={30} stroke={2.2} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-[#8A2C07]">{t.dropHere}</div>
            <div className="text-xl font-bold leading-snug">{to}</div>
          </div>
          {picked && <Pieces n={trip.pieces} />}
        </div>
      </section>

      {loc === 'ask' ? (
        <div className="flex flex-col items-center gap-3 rounded-[22px] bg-white p-4 text-center">
          <AllowPicture />
          <div className="text-xl font-semibold leading-snug">{t.locAsk}</div>
          <BigButton tone="orange" h={80} onClick={okAsk}><Pin size={36} stroke={2.2} />{t.locOk}</BigButton>
        </div>
      ) : picked ? (
        <>
          <BigButton tone="orange" h={100} onClick={send} disabled={busy}><Pin size={44} stroke={2.2} />{busy ? t.sending : t.send}</BigButton>
          <div className="flex items-center justify-center gap-2 text-lg text-[#4A3A2E]"><Clock size={22} />{last}</div>
          {loc && <Notice loc={loc} />}
        </>
      ) : (
        <>
          <BigButton tone="orange" h={100} onClick={pickedUp} disabled={busy}><BoxTick size={44} stroke={2.2} />{t.pickedUp}</BigButton>
          {loc && <Notice loc={loc} />}
        </>
      )}

      <div className="mt-auto flex flex-col gap-3 pt-2">
        {picked && <BigButton tone="green" h={78} onClick={() => { setLoc(null); setView('deliver'); }}><BoxTick size={36} />{t.delivered}</BigButton>}
        {callBtn}
      </div>
    </Page>
  );
}

function Pieces({ n }: { n: number }) {
  const { t } = useLang();
  return (
    <div className="flex-none text-center">
      <div className="text-[44px] font-extrabold leading-none" style={{ fontFamily: 'Figtree, sans-serif' }}>{n}</div>
      <div className="text-[15px] text-[#4A3A2E]">{t.pcs}</div>
    </div>
  );
}

function Notice({ loc }: { loc: Exclude<Loc, null | 'ask'> }) {
  const { t } = useLang();
  if (loc === 'off') {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-[22px] bg-[#FFF1D6] p-4 text-center">
        <LocationSwitchPicture />
        <div className="text-xl font-semibold leading-snug text-[#5C3A00]">{t.locOff}</div>
      </div>
    );
  }
  const text = loc === 'queued' ? t.queued : loc === 'net' ? t.noSignal : t.locFail;
  return (
    <div role="alert" className="flex items-center gap-3 rounded-2xl bg-[#FFF1D6] p-3 text-lg font-semibold text-[#5C3A00]">
      {loc === 'fail' ? <Pin size={32} /> : <Wifi size={32} />}<span className="flex-1">{text}</span>
    </div>
  );
}

/** Phone photos are several MB: send a small JPEG instead. */
function shrink(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}
