import { useState, type FormEvent } from 'react';
import type { Role, StoreSummary } from '@sm/contract';
import { Button } from '../../components/Button';
import { storeLabel } from '../../lib/format';
import { addPerson, type Invite } from './users';

type Loc = Pick<StoreSummary, 'store_id' | 'city'>;
type Errors = Partial<Record<'name' | 'mobile' | 'email' | 'store' | 'form', string>>;

const field =
  'min-h-[52px] w-full rounded-xl border-[1.5px] border-[#D9C49C] bg-[#FFFDF8] px-4 text-base text-ink outline-none focus:border-cta focus:ring-2 focus:ring-cta-bg';

/** 10-digit Indian mobile from "+91 98390 41275", "098390 41275" or "9839041275"; null when it isn't one. */
export function mobile10(raw: string): string | null {
  const d = raw.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

const ROLES: { value: Role; title: string; detail: string }[] = [
  { value: 'store_manager', title: 'Store manager', detail: 'Sees one store' },
  { value: 'super_admin', title: 'Super admin', detail: 'Sees everything and manages people' },
];

/** "Add a person": a super admin or a store manager, by work email. Name and mobile are optional. */
export function AddPerson({ stores, onAdded }: { stores: Loc[]; onAdded: (invite: Invite) => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('store_manager');
  const [store, setStore] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v: Errors = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) v.email = 'Enter a work email like name@manyavar.com';
    if (role === 'store_manager' && !store) v.store = 'Pick their store';
    if (mobile.trim() && !mobile10(mobile)) v.mobile = 'Enter a 10-digit mobile number, or leave it empty';
    if (name.trim().length > 100) v.name = 'At most 100 characters';
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      onAdded(await addPerson({
        email: email.trim().toLowerCase(),
        role,
        ...(role === 'store_manager' ? { location_id: store } : {}),
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(mobile.trim() ? { mobile: mobile10(mobile)! } : {}),
      }));
      setEmail(''); setStore(''); setName(''); setMobile('');
    } catch (err) {
      setErrors({ form: (err as Error).message });
    }
    setBusy(false);
  }

  const label = 'flex flex-col gap-1.5 text-sm font-semibold text-ink';
  const optional = <span className="font-normal text-muted">(optional)</span>;
  const err = (m?: string) => m && <span className="font-medium text-danger">{m}</span>;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <label className={`${label} max-w-[520px]`}>Work email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" aria-invalid={!!errors.email} className={field} />
        {errors.email ? err(errors.email) : <span className="font-normal text-muted">They sign in with this email. One email has one role.</span>}
      </label>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1.5 p-0 text-sm font-semibold text-ink">Role</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ROLES.map((r) => {
            const on = role === r.value;
            return (
              <label key={r.value}
                className={`flex min-h-[64px] cursor-pointer items-center gap-3 rounded-xl border-[1.5px] px-4 py-3 ${on ? 'border-cta bg-cta-bg' : 'border-[#D9C49C] bg-[#FFFDF8] hover:border-cta'}`}>
                <input type="radio" name="role" value={r.value} checked={on} onChange={() => setRole(r.value)} className="h-5 w-5 shrink-0 accent-cta" />
                <span className="flex flex-col">
                  <span className="text-base font-bold text-ink">{r.title}</span>
                  <span className="text-sm text-[#4A3A2E]">{r.detail}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-6 gap-y-5">
        {role === 'store_manager' && (
          <label className={label}>Store
            <select value={store} onChange={(e) => setStore(e.target.value)} aria-invalid={!!errors.store} className={`${field} px-3`}>
              <option value="">Pick a store</option>
              {stores.map((s) => <option key={s.store_id} value={s.store_id}>{storeLabel(s)}</option>)}
            </select>
            {errors.store ? err(errors.store) : <span className="font-normal text-muted">They will see this store only.</span>}
          </label>
        )}
        <label className={label}><span>Name {optional}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" aria-invalid={!!errors.name} className={field} />
          {errors.name ? err(errors.name) : <span className="font-normal text-muted">Left empty: the part of the email before @.</span>}
        </label>
        <label className={label}><span>Mobile (WhatsApp) {optional}</span>
          <input type="tel" inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+91" aria-invalid={!!errors.mobile} className={field} />
          {errors.mobile ? err(errors.mobile) : <span className="font-normal text-muted">Lets you send the link on WhatsApp.</span>}
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy} aria-busy={busy}>Add and get sign-in link</Button>
        <span className="text-[15px] text-muted">The link works once, for 24 hours.</span>
      </div>
      {errors.form && <p role="alert" className="m-0 text-sm font-medium text-danger">{errors.form}</p>}
    </form>
  );
}
