import { useState } from 'react';
import type { StoreSummary } from '@sm/contract';
import { storeLabel } from '../../lib/format';
import type { Invite } from './users';

type Loc = Pick<StoreSummary, 'store_id' | 'city'>;

/** WhatsApp click-to-chat: the super admin's own WhatsApp sends it, no API or account on our side. No mobile: WhatsApp asks who to send it to. */
function waLink(mobile: string, text: string) {
  const d = mobile.replace(/\D/g, '').slice(-10);
  return `https://wa.me/${d.length === 10 ? `91${d}` : ''}?text=${encodeURIComponent(text)}`;
}

export function InviteCard({ invite, stores }: { invite: Invite; stores: Loc[] }) {
  const { user, invite_url } = invite;
  const [copied, setCopied] = useState(false);
  const admin = user.role === 'super_admin';
  const store = storeLabel(user.location_id ?? '', stores);
  const first = user.name.split(' ')[0];
  const what = admin ? 'as a super admin: every store and the warehouse, and adding people' : `for ${store}`;
  const text = `Namaste ${first}, you can now use Stock Mover ${what}. Sign in with ${user.email}. Set your password here (the link works once, for 24 hours): ${invite_url}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(invite_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: the link is on screen to select by hand */ }
  }

  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-5 rounded-2xl bg-ok-bg p-6 text-[#123D2E]">
      <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-1.5">
        <div className="font-heading text-2xl">{admin ? `${user.name} is added as a super admin.` : `${user.name} is added for ${store}.`}</div>
        <div className="text-base leading-normal">
          Send the link. They set a password, sign in with {user.email} and {admin ? 'see every location and can add people' : `see ${store}`} from then on.
        </div>
        <div className="font-mono text-sm break-all text-[#1D5B45]">{invite_url}</div>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <a href={waLink(user.mobile, text)} target="_blank" rel="noopener noreferrer"
          className="inline-flex min-h-[52px] items-center gap-2.5 rounded-xl bg-[#1D6B4F] px-5 text-base font-semibold text-white no-underline hover:bg-[#123D2E]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
          Send on WhatsApp
        </a>
        <button type="button" onClick={copy}
          className="min-h-[52px] rounded-xl border-[1.5px] border-[#9CC7B3] bg-white px-5 text-base font-semibold text-[#123D2E] hover:bg-[#F3FAF6]">
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </div>
  );
}
