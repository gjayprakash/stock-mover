import type { Blocked } from '@sm/contract';
import { num } from '../lib/format';

type Props = { blocked: Blocked; violations?: number; className?: string };

const RULES: { key: keyof Blocked; rule: string; stopped: string }[] = [
  { key: 'min_display', rule: 'Every store keeps its minimum display', stopped: 'Minimum display kept' },
  { key: 'capacity', rule: 'No store goes over its capacity', stopped: 'Capacity respected' },
  { key: 'flagship', rule: "Flagships keep their top-20 styles", stopped: 'Flagship top-20 kept' },
  { key: 'in_transit', rule: 'Stock on the way counts, never sent twice', stopped: 'In-transit counted' },
  { key: 'donor_cover_30', rule: 'A giving store keeps 30 days of stock', stopped: 'Donor kept 30 days' },
];

/** Green trust panel: the five rules, each with how many candidate moves it stopped. */
export function ChecksPanel({ blocked, violations = 0, className = '' }: Props) {
  return (
    <div className={`rounded-2xl bg-ok-bg p-5 text-[#123D2E] md:p-6 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="m-0 font-heading text-xl font-normal">Rule checks</h3>
        <span className={`text-sm font-bold ${violations === 0 ? 'text-ok' : 'text-danger'}`}>
          {violations === 0 ? '0 rules broken' : `${num(violations)} rules broken`}
        </span>
      </div>
      <ul className="m-0 mt-4 flex list-none flex-col gap-3 p-0">
        {RULES.map((r) => (
          <li key={String(r.key)} className="flex items-start gap-3 text-[15px] leading-snug">
            <svg width="20" height="20" viewBox="0 0 24 24" className="mt-0.5 shrink-0 text-ok" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            <span>
              <span className="font-semibold">{r.stopped}:</span> stopped {num(blocked[r.key] ?? 0)}{' '}
              {blocked[r.key] === 1 ? 'move' : 'moves'}
              <span className="block text-sm opacity-80">{r.rule}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
