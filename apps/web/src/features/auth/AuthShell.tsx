import type { ReactNode } from 'react';
import manyavarLogo from '../../assets/manyavar.png';
import authHero from '../../assets/auth-hero.jpg';

/** Sign in and invite pages, outside the main layout. Under 768 px the brown panel is a slim header (no photo). */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-page font-body text-ink md:flex-row">
      <aside className="relative flex items-center gap-3 overflow-hidden bg-brown px-4 py-3 text-page md:w-[44%] md:max-w-[560px] md:flex-col md:items-start md:justify-between md:gap-12 md:px-12 md:py-12">
        <img src={authHero} alt="" aria-hidden="true" className="absolute inset-0 hidden h-full w-full object-cover object-[45%_center] md:block" />
        <div aria-hidden="true" className="absolute inset-0 hidden bg-gradient-to-b from-brown/80 via-brown/25 to-brown/95 md:block" />
        <img src={manyavarLogo} alt="Manyavar" width={319} height={77} className="relative block h-8 w-auto md:h-12" />
        <p className="relative m-0 hidden font-heading text-[40px] leading-tight drop-shadow-md md:block">
          Right stock.<br />Right store.<br />Right size.
        </p>
      </aside>
      <main className="flex flex-1 items-start justify-center px-4 pt-10 pb-16 md:items-center md:px-12">
        <div className="flex w-full max-w-[400px] flex-col gap-6">
          <p className="m-0 font-heading text-xl text-brown md:hidden">Right stock. Right store. Right size.</p>
          {children}
        </div>
      </main>
    </div>
  );
}
