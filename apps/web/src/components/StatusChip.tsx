import type { StoreSummary } from '@sm/contract';
import { STATUS_LABEL } from '../lib/format';
import { Chip, type ChipTone } from './Chip';

const TONE: Record<StoreSummary['status'], ChipTone> = { TOO_FULL: 'danger', RUNNING_EMPTY: 'warn', NORMAL: 'ok' };

/** Store status: Too full (red) / Running empty (amber) / Normal (green). */
export function StatusChip({ status }: { status: StoreSummary['status'] }) {
  return <Chip tone={TONE[status]}>{STATUS_LABEL[status]}</Chip>;
}
