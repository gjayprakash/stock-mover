import type { ReactNode } from 'react';
import manyavarLogo from '../../assets/manyavar.png';

/** Sign in and invite pages, outside the main layout. Under 768 px the brown panel is a slim header. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-page font-body text-ink md:flex-row">
      <aside className="flex items-center gap-3 bg-brown px-4 py-3 text-page md:w-[44%] md:max-w-[560px] md:flex-col md:items-start md:justify-center md:gap-12 md:px-12 md:py-12">
        <img src={manyavarLogo} alt="Manyavar" width={319} height={77} className="block h-8 w-auto md:h-12" />
        <p className="m-0 hidden font-heading text-[40px] leading-tight md:block">
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
