import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Section } from '../../components/Section';
import { Skeleton } from '../../components/Skeleton';
import { saveText } from './csvParse';
import { parseCsv } from './csvParse';
import { STOCK_COLUMNS } from './types';

const SAMPLE_NAME = 'new-stock-sample.csv';

/** Plain-word guide per column, in file order. Examples come from the sample file itself. */
const GUIDE: { label: string; help: string }[] = [
  { label: 'Where it arrived', help: 'Store code, or WH-KOL for the warehouse.' },
  { label: 'Product code', help: 'Style, number and size joined by dashes.' },
  { label: 'Product name', help: 'The name on the tag.' },
  { label: 'Size', help: 'The size at the end of the product code.' },
  { label: 'Category', help: 'As in the catalogue.' },
  { label: 'Tag price', help: 'In rupees, numbers only.' },
  { label: 'Pieces', help: 'A whole number above 0.' },
  { label: 'Date received', help: 'Year-month-day.' },
];

export function SampleFile({ text }: { text: string | null }) {
  const rows = text ? parseCsv(text).slice(1) : [];
  const first = rows[0];
  return (
    <Section n={1} title="Start from the sample file" explainer="It has the right columns in the right order. Fill it in, one row for each product and size.">
      <Card padded={false} className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5 md:px-8 md:py-7">
          <div className="min-w-0 flex-1 basis-72">
            <div className="text-xl font-bold break-all">{SAMPLE_NAME}</div>
            <div className="mt-1 text-muted">
              {STOCK_COLUMNS.length} columns{rows.length ? `, ${rows.length} example rows` : ''}. Opens in Excel or Google Sheets.
            </div>
          </div>
          <Button disabled={!text} onClick={() => text && saveText(SAMPLE_NAME, text)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 19h16" /></svg>
            Download the sample file
          </Button>
        </div>
        <div className="border-t border-line px-5 pt-5 pb-2 text-[15px] font-semibold text-muted md:px-8">This is what the file looks like</div>
        <div className="overflow-x-auto px-5 pb-6 md:px-8">
          {text ? (
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="text-left">
                  {STOCK_COLUMNS.map((c, i) => (
                    <th key={c} className="border-r border-[#6B3414] bg-brown px-3 py-3 font-semibold whitespace-nowrap text-page">
                      <span className="block text-xs font-medium text-tint">Column {i + 1}</span>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-line bg-[#FFFDF8]">
                    {STOCK_COLUMNS.map((c, j) => (
                      <td key={c} className={`p-3 ${j === 0 || j === 6 ? 'font-semibold' : ''} ${j === 2 ? '' : 'whitespace-nowrap'}`}>{r[j]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-7 gap-y-4 border-t border-line p-5 md:px-8 md:pt-6 md:pb-8">
          {GUIDE.map((g, i) => (
            <div key={g.label} className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tint text-sm font-bold text-brown">{i + 1}</span>
              <div className="min-w-0">
                <div className="font-bold">{g.label}</div>
                <div className="mt-0.5 text-sm leading-snug text-muted">
                  {g.help}
                  {first?.[i] ? <> Example: <span className="font-semibold text-ink">{first[i]}</span></> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <div className="rounded-xl bg-cta-bg px-5 py-4 leading-normal text-[#5A1D05] md:px-6">
        <span className="font-bold">Keep the columns exactly as they are.</span> Do not rename, remove or reorder them.
        {rows.length ? ` Delete the ${rows.length} example rows before you upload (if you forget, we skip them).` : ''}
      </div>
    </Section>
  );
}
