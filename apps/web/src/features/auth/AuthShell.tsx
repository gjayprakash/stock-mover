import type { ReactNode } from 'react';
import manyavarLogo from '../../assets/manyavar.png';
import authHero from '../../assets/auth-hero.jpg';

/** Sign in and invite pages, outside the main layout. Photo and form split 50/50: side by side from 768 px, stacked (photo on top) below. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-page font-body text-ink md:flex-row">
      <aside className="relative flex h-[50svh] shrink-0 flex-col justify-between overflow-hidden bg-brown p-6 text-page md:h-auto md:w-1/2 md:p-12">
        <img src={authHero} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover object-[45%_25%]" />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-brown/80 via-brown/25 to-brown/95" />
        <img src={manyavarLogo} alt="Manyavar" width={319} height={77} className="relative block h-9 w-auto self-start md:h-12" />
        <p className="relative m-0 font-heading text-[28px] leading-tight drop-shadow-md md:text-[40px]">
          Right stock.<br />Right store.<br />Right size.
        </p>
      </aside>
      <main className="flex flex-1 items-start justify-center px-4 pt-8 pb-16 md:w-1/2 md:items-center md:px-12">
        <div className="flex w-full max-w-[400px] flex-col gap-6">
          {children}
        </div>
      </main>
    </div>
  );
}
