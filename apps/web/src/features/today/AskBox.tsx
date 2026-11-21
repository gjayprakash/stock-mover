import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';

/** Question box; Enter or Ask opens the Ask screen with the question sent (?q=). */
export function AskBox() {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = q.trim();
    navigate(text ? `/ask?q=${encodeURIComponent(text)}` : '/ask');
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-card sm:flex-row sm:items-end md:p-6">
      <label className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="text-sm font-semibold text-muted">Your question</span>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Why not take stock from the flagship stores?"
          className="min-h-12 w-full rounded-xl border-2 border-line bg-page px-4 text-base text-ink outline-none focus:border-cta"
        />
      </label>
      <Button type="submit">Ask</Button>
    </form>
  );
}
