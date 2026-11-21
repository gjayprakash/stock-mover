import type { ReactNode } from 'react';

type Props = { n?: number; title: string; explainer?: string; action?: ReactNode; children?: ReactNode; className?: string };

/** Numbered section heading with a one-line explainer. */
export function Section({ n, title, explainer, action, children, className = '' }: Props) {
  return (
    <section className={`flex flex-col gap-5 md:gap-6 ${className}`}>
      <div className="flex flex-wrap items-center gap-4">
        {n !== undefined && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brown font-heading text-xl text-page md:h-11 md:w-11">
            {n}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="m-0 font-heading text-2xl font-normal text-ink md:text-3xl">{title}</h2>
          {explainer && <p className="mt-1 text-base text-muted">{explainer}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
