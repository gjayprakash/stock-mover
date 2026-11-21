import type { Move } from '@sm/contract';

const LABEL: Record<Move['velocity_basis'], string> = {
  own: "Based on this store's own sales",
  blended: 'Based on own + similar stores',
  peer: 'Based on similar stores (little own data)',
};

/** own = green, blended/peer = amber. `showLabel` adds the plain-words text. */
export function ConfidenceDot({ basis, showLabel }: { basis: Move['velocity_basis']; showLabel?: boolean }) {
  const color = basis === 'own' ? 'bg-ok' : 'bg-warn';
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted" title={LABEL[basis]}>
      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${color}`} aria-hidden="true" />
      {showLabel ? LABEL[basis] : <span className="sr-only">{LABEL[basis]}</span>}
    </span>
  );
}
