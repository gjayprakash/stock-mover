import { Chip, type ChipTone } from '../../components/Chip';
import { showMobile, type Driver, type DriverStatus } from './api';

const STATUS: Record<DriverStatus, [string, ChipTone]> = {
  PAIRED: ['Connected', 'ok'],
  LINK_SENT: ['Link sent', 'warn'],
  LINK_EXPIRED: ['Link expired', 'danger'],
  TURNED_OFF: ['Turned off', 'neutral'],
};

/** "47 min ago", "3 h 10 min ago", or "12 Nov" when older than a day. */
function ago(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ${min % 60} min ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
const actionCls = 'min-h-11 inline-flex items-center font-semibold underline-offset-2 hover:underline disabled:opacity-50';

type Props = { driver: Driver; busy: boolean; onNewLink: (id: string) => void; onRevoke: (d: Driver, what: 'cancel' | 'off') => void };

export function DriverCard({ driver: d, busy, onNewLink, onRevoke }: Props) {
  const [label, tone] = STATUS[d.status];
  const first = d.name.trim().split(/\s+/)[0];
  return (
    <article className="flex flex-col gap-3.5 rounded-[18px] bg-white p-6 shadow-card">
      <div className="flex items-center gap-3">
        <span className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-full bg-tint font-bold text-brown" aria-hidden="true">{initials(d.name)}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold">{d.name}</div>
          <div className="text-sm text-muted">{showMobile(d.mobile)}</div>
        </div>
        <Chip tone={tone} className="!text-[13px]">{label}</Chip>
      </div>
      <div className="flex flex-col gap-1.5 text-[15px] text-[#2E221A]">
        <div>
          <span className="text-muted">Last location sent:</span>{' '}
          {d.last_ping_at ? `${ago(d.last_ping_at)}${d.last_ping_place ? `, ${d.last_ping_place}` : ''}` : 'Not yet'}
        </div>
        <div>
          <span className="text-muted">Carrying now:</span> {d.load ? `${d.load.pieces} ${d.load.pieces === 1 ? 'piece' : 'pieces'} to ${d.load.to}` : 'Nothing'}
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        {d.status === 'PAIRED' && (
          <>
            <a href={`tel:+91${d.mobile}`} className={`${actionCls} text-[#A8340A]`}>Call {first}</a>
            <button type="button" disabled={busy} onClick={() => onRevoke(d, 'off')} className={`${actionCls} text-[#6B5B4E]`}>Turn off phone</button>
          </>
        )}
        {(d.status === 'LINK_SENT' || d.status === 'LINK_EXPIRED') && (
          <>
            <button type="button" disabled={busy} onClick={() => onNewLink(d.id)} className={`${actionCls} text-[#A8340A]`}>Send a new link</button>
            <button type="button" disabled={busy} onClick={() => onRevoke(d, 'cancel')} className={`${actionCls} text-[#6B5B4E]`}>Cancel link</button>
          </>
        )}
        {d.status === 'TURNED_OFF' && (
          <button type="button" disabled={busy} onClick={() => onNewLink(d.id)} className={`${actionCls} text-[#A8340A]`}>Connect again</button>
        )}
      </div>
    </article>
  );
}
