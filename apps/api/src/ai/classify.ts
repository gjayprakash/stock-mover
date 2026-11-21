import { isEmpty, type About } from './entities';
import { isForecastRequest } from './grounding';

/**
 * Ask v2: what kind of question this is, decided on the server by plain rules (no model call), so the decision
 * can be explained and is the same every time.
 *
 * - TODAY:    today's move list (moves, stores, problems, flags). Any recognised store, product or move counts.
 * - HISTORY:  the 12-week sales and stock history (weeks, trend, sold, sales over time).
 * - RUNS:     past daily runs (when it ran, how many moves earlier lists had).
 * - RULES:    the rules sheet, lead times, minimum display and the engine's settings.
 * - FORECAST: asks about the future. Never answered with numbers: the past trend is shown (checked), the outlook in words.
 * - GENERAL:  a general part (what a term means, how to use the app, retail practice, anything unrelated).
 *
 * mode: DATA when only data kinds apply, GENERAL when none do, MIXED when both (forecasts are always MIXED).
 */
export type Kind = 'TODAY' | 'HISTORY' | 'RUNS' | 'RULES' | 'FORECAST' | 'GENERAL';
export type Mode = 'DATA' | 'GENERAL' | 'MIXED';
export type Plan = { kinds: Kind[]; mode: Mode; why: string };

const TODAY_WORDS = /\b(moves?|moving|today'?s (list|moves|data|run)|for today|the list|this list|sign[- ]?offs?|approv\w*|arriv\w*|send(s|ing)?|sent|receiv\w*|pull[- ]?backs?|back to (the )?warehouse|transfers?|problems?|flags?|in[- ]transit|blocked|running empty|too full|sold out|out of stock|urgent|priority|which stores?|how many (stores|pieces|units|moves)|stores? at risk|stock at|warehouse|p\d{1,2})\b/i;
const HISTORY_WORDS = /\b(history|historical|trend\w*|weekly|week ending|over time|(last|past|previous) (\d+ |few |twelve |couple of )?(weeks?|months?)|12 weeks|twelve weeks|last week|(has|have|did) .{0,40}\bs(old|ell)|sales (were|was|have been)|sold (in|over|during|last)|sell[- ]through|days in stock|in[- ]stock days|closing stock)\b/i;
const RUN_WORDS = /\b(runs|ran|daily run|last run|next run|previous (list|run)s?|earlier (list|run)s?|yesterday'?s (list|run)|engine version|schedule[ds]?|cron)\b|\bthe run\b|\bwhen did (it|the list|stock mover) run\b/i;
const RUN_OUT = /\brun(s|ning)? (out|empty|low)\b/i;
const RULE_WORDS = /\b(rules?|minimum display|min(imum)?[- ]display|lead[- ]times?|flagships?|s\+\+|top[- ]?20|capacity|donor|giving store|30 days|cover (target|threshold|rule)|target cover|thresholds?|settings?|tunables?|parameters?|sign[- ]?off (limit|threshold|rule)|1,?00,?000|lakh|ageing (rule|threshold|limit)|how (does|do) (stock mover|the engine|it|you) (decide|choose|pick|work)|why not take)\b/i;
// A general part: definitions, how-to, practice, opinion. Checked only after the data words, so "which moves…" stays data.
const GENERAL_WORDS = /\b(what (is|are|does) (an? |the )?[a-z' -]{2,40}\b(mean|means)\b|meaning of|define|definition|in general|generally|typically|usually|best practices?|industry|retail(ers)? (practice|norm|standard)|why do (stores|retailers|brands)|how should (i|we|a store)|tips?|advice|good idea|explain (what|how|why)|what is (an? )?(sku|style|sell[- ]through|cover|pull[- ]?back|min(imum)? display|lead time|velocity|ageing)\b)/i;
// Using the app: screens, buttons, export, sign-in. Answered as general app help.
const APP_WORDS = /\b(screen|page|tab|button|click|the app|this app|export|download|csv|sign (in|out)|log ?in|password|dashboard|how do i (use|approve|export|find|see|add|request|pair|track)|where (can|do) i (find|see))\b/i;
// A pure definition ("what does sell-through mean?") needs no data unless it also points at ours.
const DEFINITION = /^\s*(what (does|do) .{2,40} mean\b|what('?s| is| are) (an? )?[a-z' -]{2,30}\??\s*$|define\b|meaning of\b|explain the term\b)/i;
const OURS_Q = /\b(our|my|we|us|today|which|how many|how much|list|show|here)\b/i;
// Thanks, greetings and the like are never data questions, even right after one.
const SMALL_TALK = /^\s*(thanks?|thank you|ok(ay)?|great|cool|nice|got it|hi|hello|hey|good (morning|evening))\b[\s!.]*$/i;
// A bare follow-up ("why?", "and that one?") inherits the previous question's kinds.
const FOLLOW_UP = /^\s*(and\b|also\b|what about\b|how about\b|why\b|why not\b|how come\b|really\b|ok\b|so\b|more\b|tell me more\b|explain\b|which one|those|them|that|this|it\b)/i;

/** One question's data kinds and whether it has a general part, by keywords and recognised entities. */
function signals(q: string, about: About) {
  const kinds: Kind[] = [];
  const why: string[] = [];
  const app = APP_WORDS.test(q) && isEmpty(about);
  const named = !isEmpty(about);
  if (named) why.push('names ' + [about.moves.length && 'a move', about.stores.length && 'a store', about.skus.length && 'a product'].filter(Boolean).join(' and '));
  const history = HISTORY_WORDS.test(q);
  const runs = RUN_WORDS.test(q) && !RUN_OUT.test(q);
  const rules = RULE_WORDS.test(q);
  const today = !app && (named || TODAY_WORDS.test(q));
  if (today) kinds.push('TODAY');
  if (history) (kinds.push('HISTORY'), why.push('asks about past weeks'));
  if (runs) (kinds.push('RUNS'), why.push('asks about runs'));
  if (rules) (kinds.push('RULES'), why.push('asks about a rule or setting'));
  if (today && !named) why.push("uses words about today's list");
  // Rule questions usually ask why something on today's list did or did not happen, so they see the list too.
  if (rules && !today && !app) kinds.unshift('TODAY');
  const general = app || GENERAL_WORDS.test(q);
  if (app) why.push('asks how to use the app');
  else if (general) why.push('has a general part (a term, practice or how-to)');
  return { kinds, general, why };
}

export function classify(question: string, about: About, previousQuestion?: string, previousAbout?: About): Plan {
  if (SMALL_TALK.test(question)) return { kinds: ['GENERAL'], mode: 'GENERAL', why: 'small talk' };
  let { kinds, general, why } = signals(question, about);
  if (DEFINITION.test(question) && isEmpty(about) && !OURS_Q.test(question) && !kinds.includes('RULES') && !kinds.includes('RUNS')) {
    return { kinds: ['GENERAL'], mode: 'GENERAL', why: 'asks what a term means, about nothing in your data' };
  }
  if (!kinds.length && !general && previousQuestion && (FOLLOW_UP.test(question) || question.trim().split(/\s+/).length <= 4)) {
    const prev = signals(previousQuestion, previousAbout ?? { stores: [], skus: [], moves: [] });
    if (prev.kinds.length) {
      kinds = prev.kinds;
      why = ['follows on from the previous question'];
    }
  }
  if (isForecastRequest(question)) {
    // No future numbers: show the past trend (checked) and give any outlook in words only.
    const data = kinds.filter((k) => k !== 'HISTORY');
    return { kinds: [...data, 'HISTORY', 'FORECAST'], mode: 'MIXED', why: ['asks about the future', ...why].join('; ') };
  }
  if (!kinds.length) return { kinds: ['GENERAL'], mode: 'GENERAL', why: why.length ? why.join('; ') : 'names nothing in your data' };
  if (general) return { kinds: [...kinds, 'GENERAL'], mode: 'MIXED', why: why.join('; ') };
  return { kinds, mode: 'DATA', why: why.join('; ') };
}

/** Plain words for the "Deciding what kind of question it is" step. */
export const KIND_WORDS: Record<Kind, string> = {
  TODAY: "today's list",
  HISTORY: 'the last 12 weeks of sales and stock',
  RUNS: 'past daily runs',
  RULES: 'the rules and settings',
  FORECAST: 'the future (past trend checked, outlook in words only)',
  GENERAL: 'a general part, not checked against your data',
};

export function planWords(p: Plan): string {
  if (p.mode === 'GENERAL') return 'General question: answered from general knowledge, not your data';
  const data = p.kinds.filter((k) => k !== 'GENERAL' && k !== 'FORECAST').map((k) => KIND_WORDS[k]);
  const extra = p.kinds.includes('FORECAST') ? '. Forecast: no future numbers, outlook in words only' : p.kinds.includes('GENERAL') ? ', plus a general part' : '';
  return `About ${data.join(', ')}${extra}`;
}
