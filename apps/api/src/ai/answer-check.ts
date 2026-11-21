// Ask v2: the check an answer gets, by mode. Data answers (and the data part of a mixed answer) go through the
// unchanged AllowedSet; a general answer, or the general part, is scanned for figures about our data, which are
// then checked the same way. A forecast outlook may hold no number at all.
import type { MovesFile } from '@sm/contract';
import { TODAY } from '../engine/params';
import type { Plan } from './classify';
import { chatContext } from './context';
import { recognise } from './entities';
import { AllowedSet, CODE, MOVE_ID, NumberSet, datesIn, numbersIn, type GroundingResult, type LineSource } from './grounding';
import { GENERAL_LINE } from './prompts';

export type AnswerCheck = GroundingResult & { generalLeak: boolean };

/** Splits a mixed answer at the "In general:" heading. */
export function splitGeneral(text: string): { data: string; general: string | null } {
  const m = GENERAL_LINE.exec(text);
  if (!m) return { data: text, general: null };
  return { data: text.slice(0, m.index), general: text.slice(m.index) };
}

const OURS = /\b(your|our|you have|we have|today'?s (list|data)|this list|the list|on the list|manyavar)\b/i;
const MARKER = /^\s*(?:\d{1,3}[.)]|[-*•])\s+/;

/**
 * Lines of a general answer (or general part) that are really about our data, so they must be checked: they name a
 * store, product or move id, or pair a number with a store's city, a product's name or "your / our / the list".
 * In a forecast outlook any number counts (outlooks are words only).
 */
export function dataLines(text: string, m: MovesFile, anyNumber = false): string[] {
  const ids = new Set([...m.moves.flatMap((mv) => [mv.id, mv.sku_id, mv.style_id, mv.from, mv.to]), ...m.stores.map((s) => s.store_id)]);
  const words = [...new Set([...m.stores.map((s) => s.city), ...m.moves.map((mv) => mv.style_name)])].filter(Boolean).map((w) => w.toLowerCase());
  return text.split('\n').filter((l) => {
    const codes = [...(l.match(CODE) ?? []), ...(l.match(MOVE_ID) ?? [])].filter((c) => ids.has(c));
    const { keys, rest } = datesIn(l.replace(MARKER, ''));
    const hasNum = numbersIn(rest).length > 0 || keys.length > 0;
    const low = l.toLowerCase();
    return codes.length > 0 || (hasNum && (anyNumber || OURS.test(l) || words.some((w) => low.includes(w))));
  });
}

export function checkAnswer(
  answer: string,
  o: { plan: Plan; m: MovesFile; question: string; allowed: AllowedSet; wider: LineSource[] },
): AnswerCheck {
  const { plan, m, question, allowed, wider } = o;
  if (plan.mode === 'GENERAL') {
    const leak = dataLines(answer, m);
    if (!leak.length) return { found: 0, total: 0, missing: [], ok: true, generalLeak: false };
    // Treated as a data answer: checked against the data for whatever it names.
    const text = leak.join('\n');
    const a = recognise(m, text);
    const g = new AllowedSet(chatContext(m, text, a), [m.run.as_of, TODAY], m, { question, about: a }, wider, true).check(text);
    return { ...g, generalLeak: true };
  }
  const { data, general } = splitGeneral(answer);
  const g = allowed.check(data);
  if (!general) return { ...g, generalLeak: false };
  const outlook = plan.kinds.includes('FORECAST');
  const leak = dataLines(general.replace(GENERAL_LINE, ''), m, outlook);
  if (!leak.length) return { ...g, generalLeak: false };
  const missing = [...g.missing];
  let total = g.total;
  // The model was told to put no figures here. One that is about our data may only repeat a figure from the checked
  // data part above it; it may never bring in a new one.
  const said = datesIn(data);
  const repeated = NumberSet.plain(numbersIn(said.rest));
  said.keys.forEach((k) => repeated.dates.add(k));
  for (const l of leak) {
    const { keys, rest } = datesIn(l.replace(MARKER, ''));
    const nums = numbersIn(rest);
    total += nums.length + keys.length;
    if (outlook) {
      missing.push(...[...nums.map(String), ...keys.map((k) => `date ${k}`)].map((n) => `${n} in the outlook (an outlook is given in words only)`));
    } else {
      missing.push(...nums.filter((n) => !repeated.hasNumber(n)).map((n) => `${n} in the general part (not in the checked answer)`));
      missing.push(...keys.filter((k) => !repeated.dates.has(k)).map((k) => `date ${k} in the general part (not in the checked answer)`));
    }
  }
  return { found: total - missing.length, total, missing, ok: !missing.length, generalLeak: true };
}
