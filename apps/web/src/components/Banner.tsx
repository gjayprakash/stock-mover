import type { ReactNode } from 'react';

type Props = { tone?: 'danger' | 'warn'; title?: string; children?: ReactNode; action?: ReactNode };

/** Red (danger) or amber (warn) strip for failed runs, data issues, sign-off notices. */
export function Banner({ tone = 'warn', title, children, action }: Props) {
  const cls = tone === 'danger' ? 'bg-danger-bg text-danger border-danger/30' : 'bg-warn-bg text-[#6B4100] border-warn/30';
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${cls}`}>
      <div className="min-w-0 flex-1 text-[15px] leading-snug">
        {title && <span className="font-bold">{title} </span>}
        {children}
      </div>
      {action}
    </div>
  );
}
