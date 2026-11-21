import type { ChipTone } from '../../components/Chip';
import { dateShort, timeShort } from '../../lib/format';
import type { Shipment } from './api';

const NO_UPDATE_MS = 3 * 3_600_000;

/** "12 min ago" under an hour, then "3 h 20 min ago", then "2 days ago". */
export function timeAgo(iso: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min ago` : `${h} h ago`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? 'day' : 'days'} ago`;
}

/** "Today 9:20 am", "Thu 19 Nov 4:10 pm". */
export function when(iso: string): string {
  const today = dateShort(new Date().toISOString());
  const d = dateShort(iso);
  return `${d === today ? 'Today' : d} ${timeShort(iso)}`;
}

/** Whole days past the due date (IST calendar), 0 when not late or already received. */
export function lateDays(s: Shipment, now = Date.now()): number {
  if (s.status === 'received' || s.status === 'delivered') return 0;
  const todayIst = new Date(now + 330 * 60_000).toISOString().slice(0, 10);
  const diff = (Date.parse(todayIst) - Date.parse(s.due_date)) / 86_400_000;
  return diff > 0 ? Math.round(diff) : 0;
}

/** On the way and nothing heard for 3 h (the last ping, or pick-up if no ping yet). */
export function noUpdate(s: Shipment, now = Date.now()): boolean {
  if (s.status !== 'in_transit') return false;
  const last = s.pings[0]?.taken_at ?? s.picked_up_at;
  return !!last && now - new Date(last).getTime() > NO_UPDATE_MS;
}

export function statusChip(s: Shipment, dir: 'in' | 'out'): { label: string; tone: ChipTone } {
  if (s.status === 'received') {
    const short = s.qty_received !== null && s.qty_received < s.qty;
    return short ? { label: `Received ${s.qty_received} of ${s.qty}`, tone: 'warn' } : { label: 'Received', tone: 'ok' };
  }
  const late = lateDays(s);
  if (late) return { label: `Late by ${late} ${late === 1 ? 'day' : 'days'}`, tone: 'danger' };
  if (noUpdate(s)) return { label: 'No update for 3 h', tone: 'orange' };
  switch (s.status) {
    case 'approved':
      return { label: dir === 'out' && !s.driver ? 'Approved · needs a driver' : 'Approved', tone: 'warn' };
    case 'assigned':
      return { label: 'Driver assigned', tone: 'neutral' };
    case 'in_transit':
      return { label: 'On the way', tone: 'neutral' };
    default:
      return { label: 'Delivered', tone: 'neutral' };
  }
}

/** Latest thing that happened, for the "Last update" column. */
export function lastUpdate(s: Shipment): string {
  const t = [s.received_at, s.delivered_at, s.pings[0]?.taken_at, s.picked_up_at, s.approved_at]
    .filter((x): x is string => !!x)
    .sort()
    .pop()!;
  return s.status === 'in_transit' ? timeAgo(t) : when(t);
}

const ORDER = ['Requested', 'Approved', 'Picked up', 'On the way', 'Delivered', 'Received'] as const;

/** The 6-step tracker: done steps with their times, the current one, the rest to come. */
export function steps(s: Shipment): { label: string; time: string; state: 'done' | 'now' | 'todo' }[] {
  const times = [s.requested_at, s.approved_at, s.picked_up_at, s.status === 'in_transit' ? s.pings[0]?.taken_at ?? null : s.delivered_at ? s.picked_up_at : null, s.delivered_at, s.received_at];
  const at = { approved: 2, assigned: 2, in_transit: 3, delivered: 5, received: 6 }[s.status];
  return ORDER.map((label, i) => ({
    label,
    time: i === 3 && s.status === 'in_transit' ? 'Now' : times[i] ? when(times[i]!) : '',
    state: i < at ? 'done' : i === at ? 'now' : 'todo',
  }));
}
