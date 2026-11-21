import { Fragment, useState } from 'react';
import type { AiCall } from '@sm/contract';
import { Card } from '../../components/Card';
import { Chip, type ChipTone } from '../../components/Chip';
import { timeShort } from '../../lib/format';

export const JOB_LABEL: Record<AiCall['job'], string> = { BRIEF: 'Briefing', ASK: 'Ask', DATA_FLAG: 'Data check' };
export const HELD_LABEL: Record<NonNullable<AiCall['held_reason']>, string> = {
  UNGROUNDED_NUMBER: 'a number was not in the list',
  FORECAST_REQUEST: 'asked for a forecast',
  OUT_OF_SCOPE: 'question outside stock moves',
  MODEL_ERROR: 'AI service error',
};
const RESULT: Record<AiCall['result'], [string, ChipTone]> = {
  SHOWN: ['Shown', 'ok'],
  HELD_BACK: ['Held back', 'danger'],
  ERROR: ['Error', 'neutral'],
};

function checked(c: AiCall) {
  if (c.held_reason === 'FORECAST_REQUEST') return 'forecast asked';
  return `${c.numbers_found} of ${c.numbers_total}`;
}

/** Recent AI calls, newest first. Click a row to see the full answer and the held reason. */
export function CallsTable({ calls }: { calls: AiCall[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[15px]">
          <thead>
            <tr className="bg-page text-left text-sm text-muted">
              <th className="py-4 pr-3 pl-6">Time</th>
              <th className="px-3 py-4">Job</th>
              <th className="px-3 py-4">What was asked</th>
              <th className="px-3 py-4">Numbers checked</th>
              <th className="py-4 pr-6 pl-3">Result</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((c) => {
              const isOpen = open === c.id;
              const [label, tone] = RESULT[c.result];
              return (
                <Fragment key={c.id}>
                  <tr
                    className="cursor-pointer border-t border-line hover:bg-page"
                    onClick={() => setOpen(isOpen ? null : c.id)}
                    aria-expanded={isOpen}
                  >
                    <td className="py-4 pr-3 pl-6 whitespace-nowrap">{timeShort(c.at)}</td>
                    <td className="px-3 py-4 font-semibold whitespace-nowrap">{JOB_LABEL[c.job]}</td>
                    <td className="px-3 py-4">{c.input_summary}</td>
                    <td className="px-3 py-4 whitespace-nowrap">{checked(c)}</td>
                    <td className="py-4 pr-6 pl-3"><Chip tone={tone}>{label}</Chip></td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-page">
                      <td colSpan={5} className="px-6 pb-5 pt-1 text-[15px] leading-relaxed">
                        {/* Sticky + capped width so the text stays readable when the table scrolls sideways on a phone. */}
                        <div className="sticky left-6 max-w-[calc(100vw-5rem)] md:max-w-none">
                          <div className="font-semibold text-muted">Full answer</div>
                          <p className="mt-1 whitespace-pre-wrap">{c.output || '(no text)'}</p>
                          {c.held_reason && (
                            <p className="mt-2 font-semibold text-danger">Held back: {HELD_LABEL[c.held_reason]}</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
