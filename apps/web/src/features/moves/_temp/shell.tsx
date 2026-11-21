// TEMPORARY stand-ins for the web shell (#3). Delete this folder after rebasing on #3
// and point ../deps.ts at the real modules.
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { HistoryFile, MoveType } from '@sm/contract';
import historyUrl from '@sm/contract/history.sample.json?url';

const nf = new Intl.NumberFormat('en-IN');
export const inr = (n: number) => `₹${nf.format(Math.round(n))}`;
export const pieces = (n: number) => `${nf.format(n)} ${n === 1 ? 'piece' : 'pieces'}`;
export const days = (n: number | null) => (n == null ? 'no sales' : `${Math.round(n)} days`);
export const dateShort = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
export const KIND_LABEL: Record<MoveType, string> = {
  WH_TO_STORE: 'Warehouse to store',
  STORE_TO_STORE: 'Store to store',
  PULL_BACK: 'Back to warehouse',
};

export function useHistory(keys: string[]) {
  const [data, setData] = useState<HistoryFile | null>(null);
  const k = keys.join(',');
  useEffect(() => {
    fetch(historyUrl).then((r) => r.json()).then(setData).catch(() => setData({}));
  }, [k]);
  return { data, loading: data == null };
}

export const Card = ({ className = '', children }: { className?: string; children: ReactNode }) => (
  <section className={`rounded-[18px] bg-white shadow-[0_1px_2px_rgba(81,29,0,0.06),0_10px_28px_rgba(81,29,0,0.08)] ${className}`}>{children}</section>
);

export const Button = ({ variant = 'primary', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' }) => (
  <button
    type="button"
    {...p}
    className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
      variant === 'primary' ? 'bg-cta text-white' : 'border-[1.5px] border-brown bg-white text-brown'
    } ${className}`}
  />
);

export const Chip = ({ tone = 'neutral', children }: { tone?: 'ok' | 'warn' | 'danger' | 'neutral'; children: ReactNode }) => {
  const c = { ok: 'bg-[#E4F1EA] text-ok', warn: 'bg-[#FDF1DC] text-warn', danger: 'bg-[#FDE9DD] text-[#8A2C07]', neutral: 'bg-tint text-brown' }[tone];
  return <span className={`inline-block rounded-full px-2.5 py-1 text-[13px] font-bold ${c}`}>{children}</span>;
};

export const ConfidenceDot = ({ basis }: { basis: 'own' | 'blended' | 'peer' }) => (
  <span
    className={`mr-2 inline-block h-[9px] w-[9px] rounded-full ${basis === 'own' ? 'bg-ok' : 'bg-warn'}`}
    title={basis === 'own' ? "Based on this store's own sales" : "Based on similar stores' sales"}
    aria-label={basis === 'own' ? "Based on this store's own sales" : "Based on similar stores' sales"}
  />
);
