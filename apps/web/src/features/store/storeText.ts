import type { Move, StoreSummary } from '@sm/contract';
import { pieces } from '../../lib/format';

const STATUS_ORDER: Record<StoreSummary['status'], number> = { RUNNING_EMPTY: 0, TOO_FULL: 1, NORMAL: 2 };

/** Status first (Running empty, Too full, Normal), then most money at risk this week. */
export function byRisk(a: StoreSummary, b: StoreSummary): number {
  return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.at_risk_week_inr - a.at_risk_week_inr;
}

/** Default store for /stores: highest at_risk_week_inr, then Running empty / Too full before Normal. */
export function mostAtRisk(stores: StoreSummary[]): StoreSummary | undefined {
  return [...stores].sort(
    (a, b) => b.at_risk_week_inr - a.at_risk_week_inr || STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
  )[0];
}

export function pct(n: number, of: number): number {
  return of > 0 ? Math.round((n / of) * 100) : 0;
}

/** "Accessories (Safa/Mala/Stole)" reads as plain "Accessories" with the parts below it. */
export function categoryName(c: string): string {
  return c.replace(/\s*\(.*\)\s*$/, '');
}

/** One plain line under the store name, picked by status. Every number comes from the store summary. */
export function summaryLine(s: StoreSummary, moveCount: number, belowMin: number): string {
  const now = pct(s.stock_now, s.capacity);
  const after = pct(s.stock_after, s.capacity);
  const below = belowMin > 0 ? ` ${belowMin} ${belowMin === 1 ? 'category is' : 'categories are'} below the display minimum.` : '';
  if (moveCount === 0) return `Shelves are ${now}% full and nothing needs to move today.${below}`;
  const plan = after === now ? `Today's plan keeps it at ${now}%.` : `Today's plan takes it to ${after}%.`;
  if (s.status === 'RUNNING_EMPTY') return `This store sells, but its shelves are only ${now}% full. ${plan}${below}`;
  if (s.status === 'TOO_FULL') return `This store holds more than its shelves take (${now}% full). ${plan}${below}`;
  return `Shelves are ${now}% full. ${plan}${below}`;
}

/** "14 pieces go back to the warehouse. 8 go to stores that sell them faster." */
export function outgoingText(out: Move[]): string {
  const total = out.reduce((n, m) => n + m.qty, 0);
  const back = out.filter((m) => m.type === 'PULL_BACK').reduce((n, m) => n + m.qty, 0);
  const toStores = total - back;
  const parts = [`${pieces(total)} in all.`];
  if (back) parts.push(`${pieces(back)} that are not selling here go back to the warehouse.`);
  if (toStores) parts.push(`${pieces(toStores)} go to stores that sell them faster.`);
  parts.push('Nothing leaves that would take a category under its minimum.');
  return parts.join(' ');
}
