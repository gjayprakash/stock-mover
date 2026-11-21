import type { RunRow } from '@sm/contract';
import { dateShort, timeShort } from '../../lib/format';

/** Plain labels for summary.found keys. [one, many]. Unknown keys fall back to the key in words. */
const FOUND: Record<string, [string, string]> = {
  stockout_masked_demand: [
    'product that looks dead but was simply out of stock',
    'products that look dead but were simply out of stock',
  ],
  over_capacity: [
    'store over its space limit on the counted stock (the count may be wrong; the plan uses the trusted count)',
    'stores over their space limit on the counted stock (the count may be wrong; the plan uses the trusted count)',
  ],
  data_flags: ['stock count that looks wrong', 'stock counts that look wrong'],
  below_min_display: ['store category below its display minimum', 'store categories below their display minimum'],
  ageing_units: ['old piece that is not selling', 'old pieces that are not selling'],
  starved_bestseller: ['best-seller running out', 'best-sellers running out'],
};

export function foundLabel(key: string, n: number): string {
  const l = FOUND[key];
  if (l) return n === 1 ? l[0] : l[1];
  return key.replace(/_/g, ' ');
}

export const TRIGGER: Record<RunRow['trigger'], string> = {
  cron: 'Scheduled, on its own',
  boot: 'On server start',
  manual: 'Started by hand',
};

/** "Sun 1 Nov, 6:00 am" in IST. */
export function when(iso: string): string {
  return `${dateShort(iso)}, ${timeShort(iso)}`;
}

/** The six steps every run goes through (mirrors apps/api runEngine + brief). */
export const STEPS = [
  { t: 'Read stock, sales and deliveries', d: 'Every store and the warehouse' },
  { t: 'Work out sales per day on the shelf', d: 'Days with nothing on the shelf are not counted as slow days' },
  { t: 'Find the problems', d: 'Shortages, empty stores, old stock, wrong counts' },
  { t: 'Plan the moves', d: 'Warehouse first, then store to store, then back to the warehouse' },
  { t: 'Check all five rules on every move', d: '' },
  { t: 'Write the briefing in plain words', d: 'AI writes it from the checked list' },
];

/** Best guess at which step a failed run stopped on, from its error text. */
export function failedStep(error: string | undefined): number {
  if (error && /violation|validator|rule/i.test(error)) return 4;
  return 0;
}
