import type { ReactNode } from 'react';

export type ChipTone = 'neutral' | 'orange' | 'ok' | 'warn' | 'danger' | 'brown';

const TONE: Record<ChipTone, string> = {
  neutral: 'bg-tint text-brown',
  orange: 'bg-cta-bg text-[#8A2C07]',
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  danger: 'bg-danger-bg text-danger',
  brown: 'bg-brown text-page',
};

export function Chip({ children, tone = 'neutral', className = '' }: { children: ReactNode; tone?: ChipTone; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold whitespace-nowrap ${TONE[tone]} ${className}`}>
      {children}
    </span>
  );
}
