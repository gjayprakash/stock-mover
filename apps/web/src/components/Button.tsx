import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'ghost';
  size?: 'md' | 'sm';
  full?: boolean;
  children: ReactNode;
};

const VARIANT = {
  primary: 'bg-cta text-white hover:bg-[#A8340A] disabled:bg-[#D9A48D]',
  outline: 'border-2 border-cta text-cta bg-white hover:bg-cta-bg disabled:opacity-50',
  ghost: 'text-brown hover:bg-tint disabled:opacity-50',
};

/** One orange primary per card; secondary actions are outline. */
export function Button({ variant = 'primary', size = 'md', full, className = '', children, type = 'button', ...rest }: Props) {
  const sz = size === 'sm' ? 'min-h-9 px-3 text-sm' : 'min-h-12 px-5 text-base';
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed ${sz} ${VARIANT[variant]} ${full ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
