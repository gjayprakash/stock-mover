import type { Move, Problem, StoreSummary } from '@sm/contract';
import { Card } from '../../components/Card';
import { Section } from '../../components/Section';
import { Skeleton } from '../../components/Skeleton';
import { WeeklyChart } from '../../components/WeeklyChart';
import { useHistory } from '../../data/useHistory';
import { dateShort, num, storeLabel } from '../../lib/format';
import { chartFromHistory, historyKeys, stockTiles, type Chart } from './derive';
import { isStoreProblem } from './status';

const PLAIN: Record<string, string> = {
  'Units sold': 'Pieces sold each week',
  'Days in stock': 'Days it was on the shelf each week',
};

const COPY: Partial<Record<Problem['kind'], { title: string; explainer: string }>> = {
  STARVED_BESTSELLER: {
    title: 'Why we think it is a shortage',
    explainer: 'Sales fell at the same time as the days it was on the shelf. People still wanted it.',
  },
  LAUNCH_RAMP: {
    title: 'Why we think sales are climbing',
    explainer: 'It is new, and it sells more each week it is on the shelf.',
  },
  TRULY_SLOW: {
    title: 'Why we think it is a slow seller',
    explainer: 'It stayed on the shelf, and still did not sell.',
  },
};

function Charts({ chart }: { chart: Chart }) {
  const first = chart.weeks[0];
  const last = chart.weeks[chart.weeks.length - 1];
  return (
    <Card className="flex flex-col gap-6">
      <p className="m-0 text-sm text-muted">{chart.label}</p>
      {chart.series.map((s) => (
        <WeeklyChart key={s.name} weeks={chart.weeks} series={[s]} label={PLAIN[s.name] ?? s.name} height={170} />
      ))}
      {first && last && (
        <div className="flex justify-between gap-3 text-[13px] text-muted">
          <span>week ending {dateShort(first)}</span>
          <span>week ending {dateShort(last)}</span>
        </div>
      )}
    </Card>
  );
}

function HistoryChart({ problem, moves, stores }: { problem: Problem; moves: Move[]; stores: StoreSummary[] }) {
  const keys = historyKeys(problem, moves);
  const { data, loading } = useHistory(keys);
  if (loading) return <Skeleton className="h-64 w-full" />;
  const [store, sku] = keys.length === 1 ? keys[0].split('|') : [];
  const label = store
    ? `${sku} at ${storeLabel(store, stores)}`
    : isStoreProblem(problem)
      ? `The items in this fix, at ${storeLabel(problem.subject.store_id!, stores)}`
      : `${problem.subject.style_id ?? problem.subject.sku_id ?? ''} at the receiving stores`.trim();
  const chart = chartFromHistory(data, label);
  if (!chart) return <Card className="text-muted">Chart not available.{moves.length > 0 && ' The fix above can still be approved.'}</Card>;
  return <Charts chart={chart} />;
}

function Tile({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-card">
      <div className={`font-heading text-[40px] leading-none ${tone ?? 'text-ink'}`}>{value}</div>
      <div className="mt-2 text-base text-[#4A3A2E]">{label}</div>
    </div>
  );
}

/** Section 1: the evidence chart plus stock tiles. */
function StoreTiles({ store, units }: { store: StoreSummary; units: number }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-5">
      <Tile value={num(store.stock_now)} label={`pieces in ${storeLabel(store)} now`} tone="text-[#8A2C07]" />
      <Tile value={num(store.capacity)} label="pieces of space in the store" />
      <Tile value={num(units)} label="pieces this fix sends in" tone="text-[#1D5B45]" />
    </div>
  );
}

export function Evidence({ problem, moves, stores }: { problem: Problem; moves: Move[]; stores: StoreSummary[] }) {
  const copy = COPY[problem.kind] ?? { title: 'What the numbers show', explainer: 'Pieces sold and days on the shelf, week by week.' };
  const tiles = stockTiles(moves);
  const store = isStoreProblem(problem) ? stores.find((s) => s.store_id === problem.subject.store_id) : undefined;
  const units = moves.reduce((s, m) => s + m.qty, 0);
  return (
    <Section n={1} title={copy.title} explainer={copy.explainer}>
      <p className="m-0 rounded-xl bg-tint px-4 py-3 text-base leading-relaxed text-[#2E221A]">{problem.seen}</p>
      {problem.chart && problem.chart.weeks.length ? <Charts chart={problem.chart} /> : <HistoryChart problem={problem} moves={moves} stores={stores} />}
      {store && moves.length > 0 && <StoreTiles store={store} units={units} />}
      {!store && moves.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-5">
          <Tile
            value={num(tiles.storesNow)}
            label={`pieces now at the ${tiles.storeCount === 1 ? 'receiving store' : `${tiles.storeCount} receiving stores`} (on hand + on the way)`}
            tone="text-[#8A2C07]"
          />
          {tiles.warehouseNow !== null && <Tile value={num(tiles.warehouseNow)} label="pieces in the warehouse today" />}
        </div>
      )}
    </Section>
  );
}
