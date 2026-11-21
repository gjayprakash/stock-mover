import type { Move } from '@sm/contract';
import { Chip, ConfidenceDot, KIND_LABEL, dateShort, days, inr } from './deps';
import type { ApprovalStatus } from './filters';

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
  expanded: boolean;
  onSelect: (on: boolean) => void;
  onToggle: () => void;
};

export function MoveRow({ move: m, status, selected, expanded, onSelect, onToggle }: Props) {
  const td = 'px-3 py-5';
  return (
    <tr
      onClick={onToggle}
      aria-expanded={expanded}
      className={`cursor-pointer border-t border-[#F3E8D2] align-top hover:bg-[#FFFDF8] ${status === 'skipped' ? 'opacity-50' : ''} ${expanded ? 'bg-[#FFFDF8]' : ''}`}
    >
      <td className="py-5 pl-5 pr-3 md:pl-7" onClick={(e) => e.stopPropagation()}>
        {status === 'approved' ? (
          <Chip tone="ok">Approved</Chip>
        ) : status === 'skipped' ? (
          <span className="text-[13px] font-semibold text-[#5E4E42]">Skipped</span>
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
      <td className={`${td} min-w-[200px]`}>
        <div className="font-bold">{m.style_name}, {m.size}</div>
        <div className="mt-0.5 text-sm text-[#5E4E42]">{m.sku_id} · {inr(m.value_inr)}</div>
        {m.needs_signoff && <div className="mt-2"><Chip tone="orange">Needs sign-off</Chip></div>}
      </td>
      <td className={`${td} whitespace-nowrap`}>
        <div className={`mb-1 text-[13px] font-bold ${KIND_COLOR[m.type]}`}>
          {KIND_LABEL[m.type]}{m.trigger === 'AGEING' ? ' · old stock' : ''}
        </div>
        <div className="font-semibold">{m.from}</div>
        <div className="text-[#5E4E42]">to {m.to}</div>
      </td>
      <td className={`${td} text-xl font-bold`}>{m.qty}</td>
      <td className={`${td} whitespace-nowrap`}>{coverText(m)}</td>
      <td className={`${td} whitespace-nowrap`}>{dateShort(m.arrives_on)}</td>
      <td className="min-w-[260px] py-5 pl-3 pr-5 leading-normal text-[#2E221A] md:pr-7">
        <span className="mr-2 align-middle"><ConfidenceDot basis={m.velocity_basis} /></span>
        {m.reason}
      </td>
    </tr>
  );
}
