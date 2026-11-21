import { Link } from 'react-router-dom';
import { useApprovals } from '../../data/approvals';
import { useAuth } from '../auth/auth';

/** One line near a bulk approve button (super admin only): what approving does, and any delivery that failed. */
export function DeliveryNote({ className = 'text-muted' }: { className?: string }) {
  const { isAdmin } = useAuth();
  const { deliveryCounts } = useApprovals();
  if (!isAdmin) return null;
  const { sending, failed } = deliveryCounts;
  return (
    <p className={`m-0 text-[13px] leading-snug ${className}`} aria-live="polite">
      Store-to-store moves become deliveries. Warehouse moves: delivery tracking coming soon.
      {sending > 0 && <> Creating {sending} {sending === 1 ? 'delivery' : 'deliveries'}…</>}
      {failed > 0 && (
        <> <strong className="font-semibold text-danger">{failed} {failed === 1 ? 'delivery' : 'deliveries'} could not be created</strong>; open the move to try again.</>
      )}
      {sending === 0 && failed === 0 && <> <Link to="/shipments" className="font-semibold underline">Shipments</Link></>}
    </p>
  );
}
