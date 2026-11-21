import { InviteForm } from '../features/auth/InviteForm';
import { AuthShell } from '../features/auth/AuthShell';

/** /invite#<token>: a new store manager sets their password. */
export default function InvitePage() {
  return <AuthShell><InviteForm /></AuthShell>;
}
