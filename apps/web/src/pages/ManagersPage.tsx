import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { Banner } from '../components/Banner';
import { dateShort, storeLabel, timeShort } from '../lib/format';
import { useAuth } from '../features/auth/auth';
import { useLocations, WAREHOUSE } from '../features/auth/viewing';
import { AddPerson } from '../features/auth/AddManager';
import { InviteCard } from '../features/auth/InviteCard';
import { listPeople, resendInvite, updatePerson, type Invite } from '../features/auth/users';
import type { PersonRow, UserStatus } from '../features/auth/types';

const STATUS: Record<UserStatus, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-ok-bg text-[#1D5B45]' },
  invited: { label: 'Invite sent', cls: 'bg-[#FCEFD2] text-[#7A4B00]' },
  off: { label: 'Turned off', cls: 'bg-[#EFE7DA] text-[#4A3A2E]' },
};

const mobileText = (m: string) => { const d = m.replace(/\D/g, '').slice(-10); return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : m || '—'; };
const seenText = (iso: string | null) => (iso ? `${dateShort(iso)}, ${timeShort(iso)}` : 'Not yet');
const link = 'min-h-11 bg-transparent p-0 font-semibold text-cta hover:text-brown disabled:opacity-50';
const th = 'border-b border-line px-3 py-4 font-bold';
const td = 'border-b border-[#F4E8D0] px-3 py-3.5';

function StatusPill({ status }: { status: UserStatus }) {
  return <span className={`rounded-full px-3 py-1 text-[13px] font-bold whitespace-nowrap ${STATUS[status].cls}`}>{STATUS[status].label}</span>;
}

function Who({ u, you }: { u: PersonRow; you?: boolean }) {
  return (
    <>
      <div className="font-bold">{u.name}{you && <span className="ml-2 rounded-full bg-tint px-2 py-0.5 text-xs font-bold text-brown">You</span>}</div>
      {u.email && <div className="text-[13px] break-all text-muted">{u.email}</div>}
    </>
  );
}

/** Super admin only: add super admins and store managers by email, send their sign-in link, change store, turn off or on. */
export default function ManagersPage() {
  const { isAdmin, me } = useAuth();
  const all = useLocations();
  const stores = all.filter((s) => s.store_id !== WAREHOUSE);
  const [rows, setRows] = useState<PersonRow[] | null>(null);
  const [isMock, setIsMock] = useState(false);
  const [error, setError] = useState<string>();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [editing, setEditing] = useState<{ id: string; store: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const inviteRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    listPeople().then((r) => { setRows(r.rows); setIsMock(r.isMock); }).catch((e: Error) => setError(e.message));
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
  const resend = (u: PersonRow) => act(u.id, async () => setInvite({ user: u, invite_url: await resendInvite(u.id) }));
  const setActive = (u: PersonRow, active: boolean) => act(u.id, () => updatePerson(u.id, { active }, me?.id));
  const saveStore = (u: PersonRow, store: string) => act(u.id, async () => { await updatePerson(u.id, { location_id: store }, me?.id); setEditing(null); });

  const admins = (rows ?? []).filter((u) => u.role === 'super_admin');
  const managerRows = (rows ?? []).filter((u) => u.role === 'store_manager');
  const activeAdmins = admins.filter((u) => u.status !== 'off').length;
  const covered = new Set(managerRows.filter((u) => u.status !== 'off').map((u) => u.location_id));
  const free = stores.filter((s) => !covered.has(s.store_id));
  const managers = managerRows.filter((u) => u.status !== 'off').length;

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="m-0 font-heading text-3xl font-normal text-ink md:text-[42px] md:leading-tight">People and access</h1>
        <p className="mt-2 mb-0 max-w-[720px] text-lg leading-normal text-[#4A3A2E]">
          Super admins see all {all.length} locations and add people. Each store manager sees only their own store: its stock, its requests and its shipments.
        </p>
      </div>
      {isMock && <Banner tone="warn">The users service could not be reached, so people added here are kept on this page only until it reloads.</Banner>}

      <Card className="flex flex-col gap-6">
        <div>
          <h2 className="m-0 font-heading text-[28px] font-normal">Add a person</h2>
          <p className="mt-1 mb-0 text-base text-muted">Add them by work email. They get a link to set their own password. No password is shared.</p>
        </div>
        <AddPerson stores={stores} onAdded={(i) => { setInvite(i); load(); }} />
        {invite && <div ref={inviteRef}><InviteCard invite={invite} stores={stores} /></div>}
      </Card>

      {error && <p role="alert" className="m-0 text-sm font-medium text-danger">{error}</p>}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="m-0 font-heading text-[28px] font-normal">Super admins</h2>
          {rows && <span className="text-[15px] text-muted">{activeAdmins} active</span>}
        </div>
        <Card padded={false} className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[15px]">
            <thead>
              <tr className="text-left text-[13px] text-muted">
                <th scope="col" className={`${th} px-5`}>Name and email</th>
                <th scope="col" className={th}>Status</th>
                <th scope="col" className={th}>Last signed in</th>
                <th scope="col" className={`${th} px-5`}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows === null && !error && <tr><td colSpan={4} className="px-5 py-6 text-muted">Loading…</td></tr>}
              {rows && admins.length === 0 && <tr><td colSpan={4} className="px-5 py-6 text-muted">No super admins listed.</td></tr>}
              {admins.map((u) => {
                const busy = busyId === u.id;
                const you = u.id === me?.id;
                const last = u.status !== 'off' && activeAdmins <= 1;
                return (
                  <tr key={u.id}>
                    <td className={`${td} px-5`}><Who u={u} you={you} /></td>
                    <td className={td}><StatusPill status={u.status} /></td>
                    <td className={`${td} text-[#4A3A2E]`}>{seenText(u.last_sign_in_at)}</td>
                    <td className={`${td} px-5`}>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        {u.status === 'invited' && <button className={link} disabled={busy} onClick={() => resend(u)}>Resend link</button>}
                        {u.status === 'off' ? (
                          <button className={link} disabled={busy} onClick={() => setActive(u, true)}>Turn on</button>
                        ) : last ? (
                          <span className="max-w-[260px] text-[13px] text-muted">The only active super admin. Add another before this one can be turned off.</span>
                        ) : you ? (
                          <span className="text-[13px] text-muted">You cannot turn yourself off.</span>
                        ) : (
                          <button className={`${link} text-[#6B5B4E]`} disabled={busy} onClick={() => setActive(u, false)}>Turn off</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="m-0 font-heading text-[28px] font-normal">Store managers</h2>
          {rows && <span className="text-[15px] text-muted">{managers} {managers === 1 ? 'manager' : 'managers'} · {free.length} {free.length === 1 ? 'store' : 'stores'} without one</span>}
        </div>
        <Card padded={false} className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[15px]">
            <thead>
              <tr className="text-left text-[13px] text-muted">
                <th scope="col" className={`${th} px-5`}>Name and email</th>
                <th scope="col" className={th}>Store</th>
                <th scope="col" className={th}>Mobile</th>
                <th scope="col" className={th}>Status</th>
                <th scope="col" className={th}>Last signed in</th>
                <th scope="col" className={`${th} px-5`}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows === null && !error && <tr><td colSpan={6} className="px-5 py-6 text-muted">Loading managers…</td></tr>}
              {rows && managerRows.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-6 text-muted">No store managers yet. Add the first one above.</td></tr>
              )}
              {managerRows.map((u) => {
                const busy = busyId === u.id;
                const edit = editing?.id === u.id ? editing : null;
                return (
                  <tr key={u.id}>
                    <td className={`${td} px-5`}><Who u={u} /></td>
                    <td className={td}>
                      {edit ? (
                        <select aria-label={`New store for ${u.name}`} value={edit.store} onChange={(e) => setEditing({ id: u.id, store: e.target.value })}
                          className="min-h-11 rounded-lg border-[1.5px] border-[#D9C49C] bg-[#FFFDF8] px-2 text-[15px]">
                          {stores.map((s) => <option key={s.store_id} value={s.store_id}>{storeLabel(s)}</option>)}
                        </select>
                      ) : storeLabel(u.location_id ?? '', stores)}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{mobileText(u.mobile)}</td>
                    <td className={td}><StatusPill status={u.status} /></td>
                    <td className={`${td} text-[#4A3A2E]`}>{seenText(u.last_sign_in_at)}</td>
                    <td className={`${td} px-5 whitespace-nowrap`}>
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
