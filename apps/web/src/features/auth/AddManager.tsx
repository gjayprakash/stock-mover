import { useState, type FormEvent } from 'react';
import type { StoreSummary } from '@sm/contract';
import { Button } from '../../components/Button';
import { storeLabel } from '../../lib/format';
import { addManager, type Invite } from './users';

type Loc = Pick<StoreSummary, 'store_id' | 'city'>;
type Errors = Partial<Record<'name' | 'mobile' | 'email' | 'store' | 'form', string>>;

const field =
  'min-h-[52px] w-full rounded-xl border-[1.5px] border-[#D9C49C] bg-[#FFFDF8] px-4 text-base text-ink outline-none focus:border-cta focus:ring-2 focus:ring-cta-bg';

/** 10-digit Indian mobile from "+91 98390 41275", "098390 41275" or "9839041275"; null when it isn't one. */
export function mobile10(raw: string): string | null {
  const d = raw.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export function AddManager({ stores, onAdded }: { stores: Loc[]; onAdded: (invite: Invite) => void }) {
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [store, setStore] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v: Errors = {};
    if (!name.trim()) v.name = 'Enter their full name';
    if (!mobile10(mobile)) v.mobile = 'Enter a 10-digit mobile number';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) v.email = 'Enter a work email like name@manyavar.com';
    if (!store) v.store = 'Pick their store';
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      onAdded(await addManager({ name: name.trim(), mobile: mobile10(mobile)!, email: email.trim().toLowerCase(), location_id: store }));
      setName(''); setMobile(''); setEmail(''); setStore('');
    } catch (err) {
      setErrors({ form: (err as Error).message });
    }
    setBusy(false);
  }

  const label = 'flex flex-col gap-1.5 text-sm font-semibold text-ink';
  const err = (m?: string) => m && <span className="font-medium text-danger">{m}</span>;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-6 gap-y-5">
        <label className={label}>Full name
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" aria-invalid={!!errors.name} className={field} />
          {err(errors.name)}
        </label>
        <label className={label}>Mobile (WhatsApp)
          <input type="tel" inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+91" aria-invalid={!!errors.mobile} className={field} />
          {err(errors.mobile)}
        </label>
        <label className={label}>Work email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" aria-invalid={!!errors.email} className={field} />
          {err(errors.email)}
        </label>
        <label className={label}>Store
          <select value={store} onChange={(e) => setStore(e.target.value)} aria-invalid={!!errors.store} className={`${field} px-3`}>
            <option value="">Pick a store</option>
            {stores.map((s) => <option key={s.store_id} value={s.store_id}>{storeLabel(s)}</option>)}
          </select>
          {errors.store ? err(errors.store) : <span className="font-normal text-muted">They will see this store only.</span>}
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
