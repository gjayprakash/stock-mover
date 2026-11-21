import { useEffect, useState } from 'react';
import { driverApi, Unpaired, type DriverMe } from './api';
import { FONT, Page, SpeakerButton, BigButton, initials, useLang } from './shell';
import { Mark, Phone, Shop, Tick } from './icons';

export const INSTALL_HINT_KEY = 'sm.driver.installHint';

/** /pair#<token>: choose a language, see who is adding you, press Join once. */
export function JoinScreen({ onJoined }: { onJoined: () => void }) {
  const { lang, t, setLang, adoptServerLang } = useLang();
  const [who, setWho] = useState<Pick<DriverMe, 'store' | 'manager_name'> | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Already-paired phones (and the mock) know their store and manager; a fresh phone asks the link who is adding it.
  useEffect(() => {
    const token = decodeURIComponent(window.location.hash.slice(1));
    driverApi.me().then((m) => { setWho(m); adoptServerLang(m.lang); }).catch((e) => {
      if (!(e instanceof Unpaired) || !token) { setWho(null); return; }
      driverApi.preview(token).then(setWho, () => setWho(null));
    });
  }, [adoptServerLang]);

  const join = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await driverApi.pair(decodeURIComponent(window.location.hash.slice(1)));
      await driverApi.setLang(lang).catch(() => undefined);
      try { localStorage.setItem(INSTALL_HINT_KEY, '1'); } catch { /* ignore */ }
      onJoined();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const whoLine = who ? t.addingYou(who.manager_name) : t.managerAddingYou;
  const langBtn = (l: 'hi' | 'en', letter: string, label: string, font: string) => {
    const on = lang === l;
    return (
      <button type="button" aria-pressed={on} onClick={() => setLang(l)}
        className="flex h-[76px] items-center justify-center gap-2.5 rounded-[18px]"
        style={{ fontFamily: font, border: on ? '3px solid #511D00' : '2px solid #E6D3B0', background: on ? '#F8ECD7' : '#FFFFFF', color: on ? '#511D00' : '#4A3A2E' }}>
        <span className="text-[32px] font-extrabold leading-none">{letter}</span>
        <span className="text-[22px] font-bold">{label}</span>
      </button>
    );
  };

  return (
    <Page>
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-2"><Mark /><span className="text-[17px] font-bold" style={{ fontFamily: 'Figtree, sans-serif' }}>Stock Mover</span></span>
        <SpeakerButton lines={[t.chooseLang, who?.store ?? '', whoLine, t.join, t.joinHint]} />
      </header>

      <div role="group" aria-label="भाषा चुनें / Choose language" className="flex flex-col gap-2.5 rounded-[22px] bg-white p-3.5 shadow-[0_1px_2px_rgba(81,29,0,0.06)]">
        <div className="text-center text-base font-semibold text-[#4A3A2E]">{t.chooseLang}</div>
        <div className="grid grid-cols-2 gap-2.5">
          {langBtn('hi', 'अ', 'हिंदी', "'Noto Sans Devanagari', sans-serif")}
          {langBtn('en', 'A', 'English', 'Figtree, sans-serif')}
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 py-4 text-center">
        <div className="flex items-center gap-3.5" aria-hidden="true">
          <span className="flex h-[84px] w-[84px] items-center justify-center rounded-[22px] bg-[#511D00] text-[#F4A27C]"><Shop size={48} stroke={1.6} /></span>
          <svg width="44" height="24" viewBox="0 0 44 24" fill="none" stroke="#C7400E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h38m-8-8 8 8-8 8" /></svg>
          <span className="flex h-[84px] w-[84px] items-center justify-center rounded-[22px] bg-white text-[#511D00] shadow-[0_6px_18px_rgba(81,29,0,0.12)]"><Phone size={46} stroke={1.6} /></span>
        </div>
        <div className="flex flex-col items-center gap-2">
          {who && (
            <span className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[#F8ECD7] text-[21px] font-extrabold text-[#511D00]" style={{ fontFamily: 'Figtree, sans-serif' }} aria-hidden="true">
              {initials(who.manager_name)}
            </span>
          )}
          {who && <div className="text-[30px] font-bold leading-tight">{who.store}</div>}
          <div className="whitespace-pre-line text-xl leading-normal text-[#2E221A]">{whoLine}</div>
        </div>
      </div>

      <div className="flex flex-col items-stretch gap-3">
        {failed && <div role="alert" className="rounded-2xl bg-[#FDE7E4] p-3 text-center text-lg font-semibold text-[#8A1C12]">{t.joinFailed}</div>}
        <BigButton tone="green" onClick={join} disabled={busy}><Tick size={44} stroke={2.8} />{t.join}</BigButton>
        <div className="text-center text-lg text-[#4A3A2E]" style={{ fontFamily: FONT }}>{t.joinHint}</div>
      </div>
    </Page>
  );
}
