/** Grey pulsing placeholder. Size it with className, e.g. "h-6 w-40". */
export function Skeleton({ className = 'h-5 w-full' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-tint ${className}`} aria-hidden="true" />;
}
