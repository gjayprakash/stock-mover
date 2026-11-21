import { Fragment } from 'react';
import type { Move } from '@sm/contract';
import { Chip, ConfidenceDot, KIND_LABEL, dateShort, days, inr } from './deps';
import type { ApprovalStatus } from './filters';
import { RowDistance } from './Distance';

/** Pinned cell below 1024 px; bg-inherit takes the row's white / hover / open tint. */
export const PIN = 'max-lg:sticky max-lg:z-[1] max-lg:bg-inherit';

const KIND_COLOR: Record<Move['type'], string> = {
  WH_TO_STORE: 'text-ok',
  STORE_TO_STORE: 'text-[#17486A]',
  PULL_BACK: 'text-[#8A2C07]',
};

/** "Days of stock" cell: the store end that matters, before → after. */
export function coverText(m: Move) {
  if (m.type === 'PULL_BACK') return `${days(m.from_before.cover_days)} at ${m.from}`;
  const after = days(m.to_after.cover_days);
  if (m.to_before.on_hand + m.to_before.in_transit === 0) return `0 left at ${m.to} → ${after}`;
  return `${days(m.to_before.cover_days)} → ${after}`;
}

type Props = {
  move: Move;
  status: ApprovalStatus;
  selected: boolean;
  /** This row's detail panel is open. */
  open: boolean;
  onSelect: (on: boolean) => void;
  onToggle: () => void;
};

export function MoveRow({ move: m, status, selected, open, onSelect, onToggle }: Props) {
  const td = 'px-2.5 py-5 xl:px-3';
  return (
    <tr
      id={`row-${m.id}`}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); }
      }}
      aria-current={open ? 'true' : undefined}
      className={`cursor-pointer scroll-mt-20 scroll-mb-24 border-t border-[#F3E8D2] align-top outline-none focus-visible:ring-2 focus-visible:ring-cta focus-visible:ring-inset md:scroll-mt-6 ${
        open ? 'bg-tint' : 'bg-white hover:bg-[#FFFDF8]'
      } ${status === 'skipped' && !open ? 'opacity-50' : ''}`}
    >
      {/* Under 1024 px the table scrolls sideways: the checkbox and product cells stay pinned (bg-inherit keeps the row's tint). */}
      <td className={`${PIN} max-lg:left-0 max-lg:w-12 max-lg:max-w-12 max-lg:min-w-12 py-5 pr-2 pl-5 xl:pl-7 ${open ? 'shadow-[inset_5px_0_0_var(--color-cta)]' : ''}`} onClick={(e) => e.stopPropagation()}>
        {status === 'approved' ? (
          <>
            <span className="max-lg:hidden"><Chip tone="ok">Approved</Chip></span>
            <span className="text-lg font-bold text-ok lg:hidden" title="Approved" aria-label="Approved">✓</span>
          </>
        ) : status === 'skipped' ? (
          <>
            <span className="text-[13px] font-semibold text-[#5E4E42] max-lg:hidden">Skipped</span>
            <span className="text-lg font-bold text-muted lg:hidden" title="Skipped" aria-label="Skipped">–</span>
          </>
        ) : (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
            aria-label={`Select ${m.id}`}
            className="h-5 w-5 accent-[#C7400E]"
          />
        )}
      </td>
      <td className={`${td} ${PIN} max-lg:left-12 max-lg:shadow-[6px_0_8px_-6px_rgba(81,29,0,0.22)] min-w-[120px] break-words xl:min-w-[160px]`}>
        <div className="font-bold">{m.style_name}, {m.size}</div>
        <div className="mt-0.5 text-sm text-[#5E4E42]"><span className="whitespace-nowrap">{m.sku_id}</span> · <span className="whitespace-nowrap">{inr(m.value_inr)}</span></div>
        {m.needs_signoff && <div className="mt-2"><Chip tone="orange">Needs sign-off</Chip></div>}
      </td>
      <td className={`${td} min-w-[120px] xl:min-w-[150px]`}>
        <div className={`mb-1 text-[13px] font-bold ${KIND_COLOR[m.type]}`}>
          {KIND_LABEL[m.type]}{m.trigger === 'AGEING' ? ' · old stock' : ''}
        </div>
        <div className="font-semibold whitespace-nowrap">{m.from}</div>
        <div className="whitespace-nowrap text-[#5E4E42]">to {m.to}</div>
        <RowDistance move={m} />
      </td>
      <td className={`${td} text-xl font-bold whitespace-nowrap tabular-nums`}>{m.qty}</td>
      <td className={td}>
        {/* Wrap only before "at" or the arrow, never inside a number. */}
        {coverText(m).split(/ (?=→ |at )/).map((part, i) => (
          <Fragment key={i}>{i > 0 && ' '}<span className="whitespace-nowrap">{part}</span></Fragment>
        ))}
      </td>
      <td className={`${td} whitespace-nowrap`}>{dateShort(m.arrives_on)}</td>
      <td className="min-w-[140px] py-5 pr-5 pl-2.5 leading-normal break-words text-[#2E221A] xl:min-w-[240px] xl:pr-7">
        <span className="mr-2 align-middle"><ConfidenceDot basis={m.velocity_basis} /></span>
        {m.reason}
      </td>
    </tr>
  );
}
