import type { MovesFile } from '@sm/contract';
import type { ApprovalsState } from '../data/approvals';

const COLUMNS = [
  'id', 'type', 'trigger', 'sku_id', 'style_name', 'size',
  'from', 'to', 'qty', 'arrives_on', 'value_inr', 'reason',
] as const;

function cell(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Downloads stock-mover-approved-<as_of>.csv with only the approved moves. Returns how many rows were written. */
export function downloadApprovedCsv(file: MovesFile, approvals: ApprovalsState): number {
  const rows = file.moves.filter((m) => approvals.moves[m.id] === 'approved');
  const lines = [COLUMNS.join(','), ...rows.map((m) => COLUMNS.map((c) => cell(m[c])).join(','))];
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stock-mover-approved-${file.run.as_of}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return rows.length;
}
