import { LoginForm } from '../features/login/LoginForm';

function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <rect x="1" y="1" width="32" height="32" rx="8" fill="#FFFBF2" />
      <path d="M9 13h13m0 0-4-4m4 4-4 4M25 21H12m0 0 4-4m-4 4 4 4" fill="none" stroke="#C7400E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Sign in, outside the main layout. Under 768 px the brown panel is a slim header. */
export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col bg-page font-body text-ink md:flex-row">
      <aside className="flex items-center gap-3 bg-brown px-4 py-3 text-page md:w-[44%] md:max-w-[560px] md:flex-col md:items-start md:justify-center md:gap-12 md:px-12 md:py-12">
        <div className="flex items-center gap-2.5">
          <Mark size={34} />
          <span className="font-heading text-lg md:text-[22px]">Stock Mover</span>
        </div>
        <p className="m-0 hidden font-heading text-[40px] leading-tight md:block">
          Right stock.<br />Right store.<br />Right size.
        </p>
      </aside>
      <main className="flex flex-1 items-start justify-center px-4 pt-10 pb-16 md:items-center md:px-12">
        <div className="flex w-full max-w-[400px] flex-col gap-6">
          <p className="m-0 font-heading text-xl text-brown md:hidden">Right stock. Right store. Right size.</p>
          <LoginForm />
        </div>
      </main>
    </div>
  );
}
