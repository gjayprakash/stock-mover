import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { Banner } from '../components/Banner';
import { dateShort, storeLabel, timeShort } from '../lib/format';
import { useAuth } from '../features/auth/auth';
import { useLocations, WAREHOUSE } from '../features/auth/viewing';
import { AddManager } from '../features/auth/AddManager';
import { InviteCard } from '../features/auth/InviteCard';
import { listManagers, resendInvite, updateManager, type Invite } from '../features/auth/users';
import type { ManagerRow as UserRow, UserStatus } from '../features/auth/types';

const STATUS: Record<UserStatus, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-ok-bg text-[#1D5B45]' },
  invited: { label: 'Invite sent', cls: 'bg-[#FCEFD2] text-[#7A4B00]' },
  off: { label: 'Turned off', cls: 'bg-[#EFE7DA] text-[#4A3A2E]' },
};

const mobileText = (m: string) => { const d = m.replace(/\D/g, '').slice(-10); return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : m; };
const seenText = (iso: string | null) => (iso ? `${dateShort(iso)}, ${timeShort(iso)}` : 'Not yet');
const link = 'min-h-11 bg-transparent p-0 font-semibold text-cta hover:text-brown disabled:opacity-50';

/** Super admin only: add store managers, send their sign-in link, change store, turn off. */
export default function ManagersPage() {
  const { isAdmin, status } = useAuth();
  const all = useLocations();
  const stores = all.filter((s) => s.store_id !== WAREHOUSE);
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [isMock, setIsMock] = useState(false);
  const [error, setError] = useState<string>();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [editing, setEditing] = useState<{ id: string; store: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const inviteRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    listManagers().then((r) => { setRows(r.rows); setIsMock(r.isMock); }).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  useEffect(() => { if (invite) inviteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [invite]);

  if (!isAdmin) return <Navigate to="/" replace />;

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    setError(undefined);
    try { await fn(); load(); } catch (e) { setError((e as Error).message); }
    setBusyId(null);
  }
  const resend = (u: UserRow) => act(u.id, async () => setInvite({ user: u, invite_url: await resendInvite(u.id) }));
  const setActive = (u: UserRow, active: boolean) => act(u.id, () => updateManager(u.id, { active }));
  const saveStore = (u: UserRow, store: string) => act(u.id, async () => { await updateManager(u.id, { location_id: store }); setEditing(null); });

  const covered = new Set((rows ?? []).filter((u) => u.status !== 'off').map((u) => u.location_id));
  const free = stores.filter((s) => !covered.has(s.store_id));
  const managers = (rows ?? []).filter((u) => u.status !== 'off').length;

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="m-0 font-heading text-3xl font-normal text-ink md:text-[42px] md:leading-tight">Store managers</h1>
        <p className="mt-2 mb-0 max-w-[720px] text-lg leading-normal text-[#4A3A2E]">
          Each manager sees only their own store: its stock, its requests and its shipments. You see all {all.length} locations.
        </p>
      </div>
      {isMock && <Banner tone="warn">The users service could not be reached, so managers added here are kept on this page only until it reloads.</Banner>}

      <Card className="flex flex-col gap-6">
        <div>
          <h2 className="m-0 font-heading text-[28px] font-normal">Add a store manager</h2>
          <p className="mt-1 mb-0 text-base text-muted">They get a link to set their own password. No password is shared.</p>
        </div>
        <AddManager stores={stores} onAdded={(i) => { setInvite(i); load(); }} />
        {invite && <div ref={inviteRef}><InviteCard invite={invite} stores={stores} /></div>}
      </Card>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="m-0 font-heading text-[28px] font-normal">Managers</h2>
          {rows && <span className="text-[15px] text-muted">{managers} {managers === 1 ? 'manager' : 'managers'} · {free.length} {free.length === 1 ? 'store' : 'stores'} without one</span>}
        </div>
        {error && <p role="alert" className="m-0 text-sm font-medium text-danger">{error}</p>}
        <Card padded={false} className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[15px]">
            <thead>
              <tr className="text-left text-[13px] text-muted">
                <th scope="col" className="border-b border-line px-5 py-4 font-bold">Name</th>
                <th scope="col" className="border-b border-line px-3 py-4 font-bold">Store</th>
                <th scope="col" className="border-b border-line px-3 py-4 font-bold">Mobile</th>
                <th scope="col" className="border-b border-line px-3 py-4 font-bold">Status</th>
                <th scope="col" className="border-b border-line px-3 py-4 font-bold">Last signed in</th>
                <th scope="col" className="border-b border-line px-5 py-4"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows === null && !error && (
                <tr><td colSpan={6} className="px-5 py-6 text-muted">Loading managers…</td></tr>
              )}
              {rows?.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-6 text-muted">No store managers yet. Add the first one above.</td></tr>
              )}
              {rows?.map((u) => {
                const busy = busyId === u.id;
                const edit = editing?.id === u.id ? editing : null;
                return (
                  <tr key={u.id}>
                    <td className="border-b border-[#F4E8D0] px-5 py-3.5">
                      <div className="font-bold">{u.name}</div>
                      <div className="text-[13px] text-muted">{u.email}</div>
                    </td>
                    <td className="border-b border-[#F4E8D0] px-3 py-3.5">
                      {edit ? (
                        <select aria-label={`New store for ${u.name}`} value={edit.store} onChange={(e) => setEditing({ id: u.id, store: e.target.value })}
                          className="min-h-11 rounded-lg border-[1.5px] border-[#D9C49C] bg-[#FFFDF8] px-2 text-[15px]">
                          {stores.map((s) => <option key={s.store_id} value={s.store_id}>{storeLabel(s)}</option>)}
                        </select>
                      ) : storeLabel(u.location_id ?? '', stores)}
                    </td>
                    <td className="border-b border-[#F4E8D0] px-3 py-3.5 whitespace-nowrap">{mobileText(u.mobile)}</td>
                    <td className="border-b border-[#F4E8D0] px-3 py-3.5">
                      <span className={`rounded-full px-3 py-1 text-[13px] font-bold whitespace-nowrap ${STATUS[u.status].cls}`}>{STATUS[u.status].label}</span>
                    </td>
                    <td className="border-b border-[#F4E8D0] px-3 py-3.5 text-[#4A3A2E]">{seenText(u.last_sign_in_at)}</td>
                    <td className="border-b border-[#F4E8D0] px-5 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-4">
                        {edit ? (
                          <>
                            <button className={link} disabled={busy || edit.store === u.location_id} onClick={() => saveStore(u, edit.store)}>Save</button>
                            <button className={`${link} text-[#6B5B4E]`} onClick={() => setEditing(null)}>Cancel</button>
                          </>
                        ) : u.status === 'off' ? (
                          <button className={link} disabled={busy} onClick={() => setActive(u, true)}>Turn on</button>
                        ) : (
                          <>
                            {u.status === 'invited'
                              ? <button className={link} disabled={busy} onClick={() => resend(u)}>Resend link</button>
                              : <button className={link} disabled={busy} onClick={() => setEditing({ id: u.id, store: u.location_id ?? stores[0]?.store_id ?? '' })}>Change store</button>}
                            <button className={`${link} text-[#6B5B4E]`} disabled={busy} onClick={() => setActive(u, false)}>Turn off</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        {rows && free.length > 0 && (
          <div className="flex flex-col gap-3 rounded-2xl bg-white px-6 py-5 shadow-[0_1px_2px_rgba(81,29,0,0.06)]">
            <div className="text-[15px] font-bold">Stores without a manager</div>
            <div className="flex flex-wrap gap-2">
              {free.map((s) => (
                <span key={s.store_id} className="rounded-full bg-tint px-3 py-1.5 text-sm font-semibold text-brown">{s.store_id}</span>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
