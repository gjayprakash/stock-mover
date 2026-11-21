import type { ReactNode } from 'react';

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-line px-6 py-12 text-center">
      <h3 className="m-0 font-heading text-xl font-normal text-brown">{title}</h3>
      {body && <p className="m-0 max-w-md text-muted">{body}</p>}
      {action}
    </div>
  );
}
