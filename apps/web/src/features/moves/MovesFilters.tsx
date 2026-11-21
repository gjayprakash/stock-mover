import { useEffect, useState } from 'react';
import type { MovesFile } from '@sm/contract';
import { Card, KIND_LABEL } from './deps';
import type { Filters, Kind } from './filters';

type Props = { file: MovesFile; filters: Filters; onChange: (f: Filters) => void };

const field = 'h-[50px] rounded-xl border-[1.5px] border-[#D9C49C] bg-[#FFFDF8] px-4 text-base';

export function MovesFilters({ file, filters, onChange }: Props) {
  const nf = new Intl.NumberFormat('en-IN');
  const { by_type } = file.summary;
  const chips: [Kind, string, number][] = [
    ['all', 'Everything', file.summary.moves],
    ['WH_TO_STORE', KIND_LABEL.WH_TO_STORE, by_type.WH_TO_STORE ?? 0],
    ['STORE_TO_STORE', KIND_LABEL.STORE_TO_STORE, by_type.STORE_TO_STORE ?? 0],
    ['PULL_BACK', KIND_LABEL.PULL_BACK, by_type.PULL_BACK ?? 0],
  ];
  const signoffCount = file.moves.filter((m) => m.needs_signoff).length;
  const stores = [...file.stores].sort((a, b) => a.store_id.localeCompare(b.store_id));

  // Search: local text, pushed to the URL after 300 ms.
  const [q, setQ] = useState(filters.q);
  useEffect(() => setQ(filters.q), [filters.q]);
  useEffect(() => {
    if (q === filters.q) return;
    const t = setTimeout(() => onChange({ ...filters, q, move: '' }), 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card className="flex flex-col gap-[18px] px-5 py-6 md:px-7">
      <div className="flex flex-wrap gap-2.5" role="group" aria-label="Kind of move">
        {chips.map(([k, label, n]) => {
          const on = filters.kind === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => onChange({ ...filters, kind: k, move: '' })}
              className={`min-h-12 rounded-full border-[1.5px] px-[18px] text-[15px] font-semibold ${
                on ? 'border-brown bg-brown text-[#FFFBF2]' : 'border-[#D9C49C] bg-white text-[#1F1410]'
              }`}
            >
              {label} · {nf.format(n)}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-0 flex-[2_1_280px] flex-col gap-1.5">
          <label htmlFor="moves-q" className="text-sm font-semibold">Search a product, size or store</label>
          <input
            id="moves-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="For example: KUR-02, Patna, Sherwani"
            className={field}
          />
        </div>
        <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-1.5">
          <label htmlFor="moves-store" className="text-sm font-semibold">Store</label>
          <select
            id="moves-store"
            value={filters.store}
            onChange={(e) => onChange({ ...filters, store: e.target.value, move: '' })}
            className={field}
          >
            <option value="">All {stores.length} stores</option>
            <option value="WH-KOL">WH-KOL · Warehouse</option>
            {stores.map((s) => (
              <option key={s.store_id} value={s.store_id}>
                {s.store_id} · {s.city}
              </option>
            ))}
          </select>
        </div>
        <label className="flex min-h-[50px] flex-[1_1_220px] cursor-pointer items-center gap-3 text-[15px] font-semibold">
          <input
            type="checkbox"
            checked={filters.signoff}
            onChange={(e) => onChange({ ...filters, signoff: e.target.checked, move: '' })}
            className="h-[22px] w-[22px] accent-[#C7400E]"
          />
          Only the {signoffCount} that need sign-off
        </label>
      </div>
    </Card>
  );
}
