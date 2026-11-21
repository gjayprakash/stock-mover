import type { ChipTone } from '../../components/Chip';
import type { BlockedReason, DeclineReason, TransferRequest } from './api';

export const BLOCKED: Record<BlockedReason, string> = {
  flagship_top20: 'Flagship top-20 style',
  under_30_days: 'Would drop under 30 days',
  under_display_min: 'Would drop under display minimum',
  none_in_stock: 'None in stock',
};

export const DECLINE: Record<DeclineReason, string> = {
  need_it_here: 'Need it here',
  count_wrong: 'Count is wrong',
  other: 'Other',
};

/** Status chip for the requester's table. */
export function statusChip(r: TransferRequest): { label: string; tone: ChipTone } {
  switch (r.status) {
    case 'waiting':
      return { label: `Waiting for ${r.from_location}`, tone: 'neutral' };
    case 'needs_signoff':
      return { label: 'Waiting for super admin sign-off', tone: 'warn' };
    case 'approved':
      return { label: 'Approved · no driver yet', tone: 'warn' };
    case 'driver_assigned':
      return { label: 'Driver assigned', tone: 'orange' };
    case 'on_the_way':
      return { label: 'On the way', tone: 'orange' };
    case 'delivered':
      return { label: 'Delivered', tone: 'ok' };
    case 'received':
      return { label: 'Received', tone: 'ok' };
    case 'declined':
      return { label: `Declined${r.reason ? ` · ${(DECLINE[r.reason as DeclineReason] ?? r.reason).toLowerCase()}` : ''}`, tone: 'danger' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'neutral' };
  }
}

export const SIGNOFF_OVER = 100000;

/** "just now", "25 min ago", "3 h ago", "2 days ago". */
export function ago(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} ${d === 1 ? 'day' : 'days'} ago`;
}

export const dayWord = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** "Teal Cotton Silk Kurta Set · M", or the SKU when the API sent no name. */
export const productName = (r: Pick<TransferRequest, 'sku_id' | 'style_name' | 'size'>) =>
  r.style_name ? `${r.style_name}${r.size ? ` · ${r.size}` : ''}` : r.sku_id;
