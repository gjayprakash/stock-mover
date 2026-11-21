import { useState } from 'react';
import { LangProvider } from './shell';
import { JoinScreen } from './JoinScreen';
import { DriverHome } from './DriverHome';

// Driver phone app: its own manifest (scope /driver, truck icon) and the Devanagari font.
function addHead(tag: 'link' | 'meta', attrs: Record<string, string>) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  document.head.appendChild(el);
}
addHead('link', { rel: 'manifest', href: '/driver.webmanifest' });
addHead('link', { rel: 'apple-touch-icon', href: '/driver-192.png' });
addHead('meta', { name: 'theme-color', content: '#511D00' });
addHead('meta', { name: 'referrer', content: 'no-referrer' });
addHead('link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700;800&family=Noto+Sans+Devanagari:wght@400;600;700&display=swap' });
document.title = 'Stock Mover · Driver';

export default function DriverApp() {
  const [path, setPath] = useState(() => window.location.pathname);
  const joined = () => {
    window.history.replaceState(null, '', '/driver'); // drops the one-time token from the address bar
    setPath('/driver');
  };
  return <LangProvider>{path.startsWith('/pair') ? <JoinScreen onJoined={joined} /> : <DriverHome />}</LangProvider>;
}
