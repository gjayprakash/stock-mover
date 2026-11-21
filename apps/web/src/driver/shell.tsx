import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { driverApi, type Lang } from './api';
import { en, type Strings } from './strings.en';
import { hi } from './strings.hi';
import { Speaker } from './icons';

const LANG_KEY = 'sm.driver.lang';

function storedLang(): Lang | null {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === 'hi' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

type LangCtx = { lang: Lang; t: Strings; chosen: boolean; setLang: (l: Lang) => void; adoptServerLang: (l: Lang | null) => void };
const Ctx = createContext<LangCtx | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => storedLang() ?? (navigator.language?.toLowerCase().startsWith('hi') ? 'hi' : 'en'));
  const [chosen, setChosen] = useState(() => storedLang() !== null);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    setChosen(true);
    try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
    window.speechSynthesis?.cancel();
    driverApi.setLang(l).catch(() => { /* not paired yet, or offline: the phone keeps it */ });
  }, []);

  // After a reinstall the phone has nothing saved; take the language kept on the device record.
  const adoptServerLang = useCallback((l: Lang | null) => {
    if (l && storedLang() === null) {
      setLangState(l);
      setChosen(true);
      try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  return <Ctx.Provider value={{ lang, t: lang === 'hi' ? hi : en, chosen, setLang, adoptServerLang }}>{children}</Ctx.Provider>;
}

export function useLang() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useLang outside LangProvider');
  return c;
}

// Voice: speechSynthesis with a Hindi or English voice when the phone has one; otherwise silent.
window.speechSynthesis?.getVoices();
export function speak(lines: string[], lang: Lang) {
  const s = window.speechSynthesis;
  if (!s) return;
  const voices = s.getVoices().map((v) => ({ v, l: v.lang.replace('_', '-').toLowerCase() }));
  const voice = (voices.find((x) => x.l === `${lang}-in`) ?? voices.find((x) => x.l.startsWith(lang)))?.v;
  if (!voice) return;
  s.cancel();
  const u = new SpeechSynthesisUtterance(lines.join('. ').replace(/\n/g, ' '));
  u.voice = voice;
  u.lang = voice.lang;
  s.speak(u);
}

export const FONT = "'Noto Sans Devanagari', Figtree, sans-serif";

/** Full-height phone page, 390 px first, capped for tablets. */
export function Page({ children, bg = '#FAF3E7' }: { children: ReactNode; bg?: string }) {
  return (
    <div className="flex min-h-dvh justify-center" style={{ background: bg, fontFamily: FONT, color: '#1F1410' }}>
      <main className="flex min-h-dvh w-full max-w-[480px] flex-col gap-3 px-[18px] pb-[22px] pt-4">{children}</main>
    </div>
  );
}

export function SpeakerButton({ lines, color = '#511D00' }: { lines: string[]; color?: string }) {
  const { lang, t } = useLang();
  return (
    <button type="button" aria-label={t.listen} onClick={() => speak(lines, lang)}
      className="flex h-[60px] w-[60px] flex-none items-center justify-center rounded-full border-0 bg-white shadow-[0_4px_14px_rgba(81,29,0,0.12)]"
      style={{ color }}>
      <Speaker size={30} />
    </button>
  );
}

/** हिंदी | English switch (top left) and the speaker (top right), on every screen after Join. */
export function Header({ lines, onColor = '#511D00', onText = '#FFFBF2', offText = '#4A3A2E' }: { lines: string[]; onColor?: string; onText?: string; offText?: string }) {
  const { lang, setLang } = useLang();
  const btn = (l: Lang, label: string, font: string) => (
    <button type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
      className="h-12 min-w-[76px] rounded-full border-0 px-3.5 text-lg font-bold"
      style={{ fontFamily: font, background: lang === l ? onColor : 'transparent', color: lang === l ? onText : offText }}>
      {label}
    </button>
  );
  return (
    <header className="flex items-center justify-between">
      <div role="group" aria-label="भाषा / Language" className="flex gap-1 rounded-full bg-white p-1 shadow-[0_2px_10px_rgba(81,29,0,0.10)]">
        {btn('hi', 'हिंदी', "'Noto Sans Devanagari', sans-serif")}
        {btn('en', 'English', 'Figtree, sans-serif')}
      </div>
      <SpeakerButton lines={lines} color={onColor} />
    </header>
  );
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

/** Big action button (≥ 64 px), always icon + word. */
export function BigButton({ children, onClick, href, tone, h = 96, disabled }: {
  children: ReactNode; onClick?: () => void; href?: string; tone: 'green' | 'orange' | 'plain'; h?: number; disabled?: boolean;
}) {
  const look = {
    green: 'bg-[#1D6B4F] text-white shadow-[0_10px_24px_rgba(29,107,79,0.35)]',
    orange: 'bg-[#C7400E] text-white shadow-[0_10px_24px_rgba(199,64,14,0.35)]',
    plain: 'bg-white text-[#4A3A2E] border-2 border-[#D9C49C]',
  }[tone];
  const cls = `flex w-full items-center justify-center gap-3.5 rounded-[22px] px-4 font-bold no-underline disabled:opacity-60 ${look}`;
  const style = { height: h, fontSize: h >= 90 ? 30 : h >= 75 ? 26 : 22, fontFamily: FONT };
  return href ? (
    <a href={href} className={cls} style={style}>{children}</a>
  ) : (
    <button type="button" onClick={onClick} disabled={disabled} className={cls} style={style}>{children}</button>
  );
}
