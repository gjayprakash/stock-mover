import type { StoreSummary } from '@sm/contract';
import { Card } from '../../components/Card';
import { num } from '../../lib/format';
import { categoryName } from './storeText';

/** One row per category: bar now (red if below minimum), light green for incoming, black tick at the minimum. */
export function CategoryBars({ categories }: { categories: StoreSummary['categories'] }) {
  const max = Math.max(1, ...categories.map((c) => Math.max(c.now + c.incoming, c.min_display)));
  const w = (v: number) => `${Math.min(100, (v / max) * 100).toFixed(1)}%`;

  return (
    <Card className="flex flex-col gap-5">
      {categories.map((c) => {
        const below = c.now < c.min_display;
        return (
          <div key={c.category} className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex w-full flex-col md:w-48 md:flex-none">
              <span className="text-[17px] font-semibold">{categoryName(c.category)}</span>
              <span className={`text-sm ${below ? 'font-bold text-danger' : 'text-muted'}`}>
                {below ? `Below minimum of ${num(c.min_display)}` : `Minimum ${num(c.min_display)}`}
              </span>
            </div>
            <div className="relative h-4 min-w-0 flex-1 basis-48 rounded-lg bg-tint" aria-hidden="true">
              <div className="absolute inset-y-0 left-0 rounded-lg bg-[#CFE3D8]" style={{ width: w(c.now + c.incoming) }} />
              <div className={`absolute inset-y-0 left-0 rounded-lg ${below ? 'bg-cta' : 'bg-brown'}`} style={{ width: w(c.now) }} />
              <div className="absolute -top-1.5 h-7 w-[3px] rounded bg-ink" style={{ left: w(c.min_display) }} />
            </div>
            <div className="text-[15px] md:w-44 md:text-right">
              <span className="font-bold">{num(c.now)}</span> now
              {c.incoming > 0 && <> · <span className="font-bold text-ok">+{num(c.incoming)}</span> coming</>}
              {c.outgoing > 0 && <> · <span className="font-bold text-[#8A2C07]">−{num(c.outgoing)}</span> leaving</>}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-5 border-t border-line pt-4 text-sm text-muted">
        <span className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded bg-brown" />On the shelf now</span>
        <span className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded bg-cta" />Below minimum</span>
        <span className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded bg-[#CFE3D8]" />Coming today</span>
        <span className="flex items-center gap-2"><span className="h-4 w-[3px] bg-ink" />Display minimum</span>
      </div>
    </Card>
  );
}
