const DAY_MS = 86_400_000;

export function toDay(iso: string): number {
  return Math.round(Date.parse(iso + 'T00:00:00Z') / DAY_MS);
}

export function fromDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromDay(toDay(iso) + days);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return toDay(toIso) - toDay(fromIso);
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "4 Nov" */
export function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

/** "Thu 5 Nov" */
export function dayDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return `${DOW[d.getUTCDay()]} ${shortDate(iso)}`;
}
