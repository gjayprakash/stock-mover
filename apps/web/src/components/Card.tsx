import type { HTMLAttributes, ReactNode } from 'react';

type Props = HTMLAttributes<HTMLDivElement> & { children: ReactNode; tint?: boolean; padded?: boolean };

/** White card with the soft two-layer shadow. `tint` = cream card. */
export function Card({ children, tint, padded = true, className = '', ...rest }: Props) {
  return (
    <div
      className={`rounded-2xl shadow-card ${tint ? 'bg-tint' : 'bg-white'} ${padded ? 'p-5 md:p-8' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
