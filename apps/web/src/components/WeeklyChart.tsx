import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { dateShort } from '../lib/format';

type Series = { name: string; values: number[] };
type Props = { weeks: string[]; series: Series[]; label?: string; height?: number };

const COLORS = ['#C7400E', '#511D00', '#B26B00', '#1F7A4D'];

/** Weekly bars (e.g. sales vs stock). `weeks` are ISO week-ending dates, one value per week per series. */
export function WeeklyChart({ weeks, series, label, height = 220 }: Props) {
  const data = weeks.map((w, i) => {
    const row: Record<string, string | number> = { week: /^\d{4}-\d{2}-\d{2}$/.test(w) ? dateShort(w).slice(4) : w };
    for (const s of series) row[s.name] = s.values[i] ?? 0;
    return row;
  });
  return (
    <figure className="m-0 min-w-0">
      {label && <figcaption className="mb-2 text-sm font-semibold text-muted">{label}</figcaption>}
      <div style={{ height }} className="w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid vertical={false} stroke="#EFE2C8" />
            <XAxis dataKey="week" tick={{ fontSize: 12, fill: '#5E4E42' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 12, fill: '#5E4E42' }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip cursor={{ fill: '#F8ECD7' }} contentStyle={{ borderRadius: 12, border: '1px solid #EFE2C8', fontSize: 13 }} />
            {series.length > 1 && <Legend wrapperStyle={{ fontSize: 13 }} iconType="circle" />}
            {series.map((s, i) => (
              <Bar key={s.name} dataKey={s.name} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
