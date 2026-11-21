import { useEffect, useState } from 'react';

type Health = { ok: boolean; db: string; now?: string; error?: string };

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch((e) => setHealth({ ok: false, db: 'unreachable', error: String(e) }));
  }, []);

  return (
    <main className="min-h-screen bg-[#fbf6ec] text-stone-900 p-10">
      <h1 className="font-serif text-4xl text-[#7a1f2b]">Stock Mover</h1>
      <p className="mt-2 text-stone-600">As of 31 Oct 2026 · scaffold</p>
      <section className="mt-8 rounded-xl border border-orange-200 bg-white p-6 max-w-md">
        <h2 className="font-semibold">System status</h2>
        <p className="mt-2">API: {health ? (health.ok ? 'up' : 'error') : 'checking…'}</p>
        <p>Database: {health?.db ?? '…'}</p>
        {health?.now && <p className="text-sm text-stone-500">DB time: {health.now}</p>}
        {health?.error && <p className="text-sm text-red-700">{health.error}</p>}
      </section>
    </main>
  );
}
