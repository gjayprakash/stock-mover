import { LoginForm } from '../features/auth/LoginForm';
import { AuthShell } from '../features/auth/AuthShell';

export default function LoginPage() {
  return <AuthShell><LoginForm /></AuthShell>;
}
