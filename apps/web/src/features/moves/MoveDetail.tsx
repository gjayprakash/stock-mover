import type { ReactNode } from 'react';
import type { Move, Side } from '@sm/contract';
import { Button, days, inr } from './deps';
import { MiniChart } from './MiniChart';
import type { ApprovalStatus } from './filters';

const CHECKS: [keyof Move['checks'], string][] = [
  ['min_display', 'Both stores keep their minimum display'],
  ['capacity', 'Receiving store stays within its space'],
  ['flagship', "Flagship top-20 styles aren't given away"],
  ['in_transit', 'Stock already on its way is counted, never sent twice'],
  ['donor_cover_30', 'Giving store keeps at least 30 days of stock'],
];

function SideRow({ store, role, wh, before, after }: { store: string; role: string; wh: boolean; before: Side; after: Side }) {
  const td = 'px-1.5 py-2 align-top md:px-3';
  return (
    <tr className="border-t border-[#F3E8D2]">
      <th scope="row" className={`${td} text-left font-semibold`}><span className="whitespace-nowrap">{store}</span> {role}</th>
      <td className={`${td} whitespace-nowrap`}>{before.on_hand} → {after.on_hand}</td>
      <td className={`${td} whitespace-nowrap`}>{before.in_transit} → {after.in_transit}</td>
      <td className={td}>{before.velocity ? `${(before.velocity * 7).toFixed(1)} a week` : '–'}</td>
      <td className={td}>
        {wh ? 'warehouse' : (
          <>
            <span className="whitespace-nowrap">{days(before.cover_days)}</span>{' '}
            <span className="whitespace-nowrap">→ {days(after.cover_days)}</span>
          </>
        )}
      </td>
    </tr>
  );
}

type Props = {
  move: Move;
  status: ApprovalStatus;
  onApprove: () => void;
  onSkip: () => void;
  onUndo: () => void;
  /** Extra blocks (e.g. #26 "closest store" details) render under the numbers. */
  extra?: ReactNode;
};

/** Expanded row: numbers behind the move, the five checks, 12-week chart, one-at-a-time actions. */
export function MoveDetail({ move: m, status, onApprove, onSkip, onUndo, extra }: Props) {
  return (
    <div className="grid gap-6 bg-[#FFFDF8] px-5 py-5 md:px-7 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="relative overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-[#4A3A2E]">
                <th className="px-1.5 py-2 align-bottom font-bold md:px-3">{m.id}</th>
                <th className="px-1.5 py-2 align-bottom font-bold md:px-3">On the shelf</th>
                <th className="px-1.5 py-2 align-bottom font-bold md:px-3">On the way</th>
                <th className="px-1.5 py-2 align-bottom font-bold md:px-3">Sells</th>
                <th className="px-1.5 py-2 align-bottom font-bold md:px-3">Days of stock</th>
              </tr>
            </thead>
            <tbody>
              <SideRow wh={m.from === 'WH-KOL'} store={m.from} role="(gives)" before={m.from_before} after={m.from_after} />
              <SideRow wh={m.to === 'WH-KOL'} store={m.to} role="(gets)" before={m.to_before} after={m.to_after} />
            </tbody>
          </table>
          <p className="mt-2 px-3 text-[13px] text-[#5E4E42]">
            {m.qty} × {inr(m.mrp)} MRP · {m.lead_time_days}-day lead time
            {m.stock_age_days != null && ` · oldest piece ${m.stock_age_days} days`}
            {m.velocity_basis !== 'own' && ` · sales rate from ${m.velocity_basis === 'peer' ? 'similar stores' : 'own + similar stores'}`}
          </p>
        </div>
        <ul className="m-0 flex list-none flex-col gap-2 rounded-xl bg-[#E4F1EA] p-4 text-sm text-[#123D2E]">
          {CHECKS.map(([k, label]) => (
            <li key={k} className="flex items-start gap-2">
              <span aria-hidden className={m.checks[k] ? 'text-ok' : 'text-danger'}>{m.checks[k] ? '✓' : '✗'}</span>
              <span>{label}</span>
            </li>
          ))}
        </ul>
        {extra}
        <div className="flex flex-wrap gap-2.5">
          {status ? (
            <Button variant="outline" onClick={onUndo}>Undo {status === 'approved' ? 'approval' : 'skip'}</Button>
          ) : (
            <>
              <Button onClick={onApprove}>{m.needs_signoff ? 'Sign off and approve' : 'Approve this move'}</Button>
              <Button variant="outline" onClick={onSkip}>Skip</Button>
            </>
          )}
        </div>
      </div>
      <div className="min-w-0">
        <MiniChart move={m} />
      </div>
    </div>
  );
}
