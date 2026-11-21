// Calls to the #23 Add stock API. In dev, when the API is unreachable or the endpoint 404s,
// a fake (fake.ts) answers instead so every state can be checked. In production an unreachable
// endpoint is reported as "unavailable", never faked.
import type { Move, StoreSummary } from '@sm/contract';
import { saveText } from './csvParse';
import type { StockCheckResult, StockCommitResult, StockErrorBody, StockRowInput } from './types';

export type FakeCtx = { stores: StoreSummary[]; moves: Move[]; today: string };

export type SampleOutcome = { kind: 'ok'; text: string; fake: boolean } | { kind: 'unavailable' };
export type CheckOutcome =
  | { kind: 'checked'; result: StockCheckResult; fake: boolean }
  | { kind: 'refused'; message: string }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string };
export type CommitOutcome =
  | { kind: 'added'; rows: number; pieces: number }
  | { kind: 'refused'; message: string }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string };

const loadFake = () => import('./fake');

/**
 * null = endpoint not there: network error, 5xx, or a 404 that is not the stock API's own
 * `{ error }` answer (the stock API uses 404 { error } for an expired check).
 */
async function call(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    const r = await fetch(url, init);
    if (r.status >= 500) return null;
    if (r.status === 404) {
      const body = (await r.clone().json().catch(() => null)) as StockErrorBody | null;
      if (!body || body.statusCode !== undefined || !body.error) return null;
    }
    return r;
  } catch {
    return null;
  }
}

function pick(body: StockErrorBody | null | undefined): string | undefined {
  if (!body) return undefined;
  return body.error || (Array.isArray(body.message) ? body.message[0] : body.message) || undefined;
}

async function messageOf(r: Response, fallback: string): Promise<string> {
  return pick((await r.json().catch(() => null)) as StockErrorBody | null) || fallback;
}

export async function loadSample(ctx: FakeCtx): Promise<SampleOutcome> {
  const r = await call('/api/stock/sample.csv');
  if (r && r.ok) return { kind: 'ok', text: await r.text(), fake: false };
  if (import.meta.env.DEV) return { kind: 'ok', text: (await loadFake()).fakeSampleCsv(ctx), fake: true };
  return { kind: 'unavailable' };
}

export async function checkFile(ctx: FakeCtx, file: File): Promise<CheckOutcome> {
  const form = new FormData();
  form.append('file', file);
  const r = await call('/api/stock/check', { method: 'POST', body: form });
  if (!r) {
    if (!import.meta.env.DEV) return { kind: 'unavailable' };
    const f = await (await loadFake()).fakeCheckFile(ctx, file);
    return f.status === 200 ? { kind: 'checked', result: f.body, fake: true } : { kind: 'refused', message: f.body.message };
  }
  if (r.ok) return { kind: 'checked', result: (await r.json()) as StockCheckResult, fake: false };
  if (r.status === 422) return { kind: 'refused', message: await messageOf(r, 'The columns are not the same as the sample file.') };
  return { kind: 'error', message: await messageOf(r, 'The file could not be checked.') };
}

export async function checkRow(ctx: FakeCtx, input: StockRowInput): Promise<CheckOutcome> {
  const r = await call('/api/stock/check-row', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  if (!r) {
    if (!import.meta.env.DEV) return { kind: 'unavailable' };
    return { kind: 'checked', result: await (await loadFake()).fakeCheckRow(ctx, input), fake: true };
  }
  if (r.ok) return { kind: 'checked', result: (await r.json()) as StockCheckResult, fake: false };
  return { kind: 'error', message: await messageOf(r, 'This item could not be checked.') };
}

export async function commit(checkId: string, fake: boolean, fallback: StockCheckResult): Promise<CommitOutcome> {
  let status: number;
  let body: Partial<StockCommitResult> & StockErrorBody;
  if (import.meta.env.DEV && fake) {
    ({ status, body } = await (await loadFake()).fakeCommit(checkId));
  } else {
    const r = await call('/api/stock/commit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ check_id: checkId }),
    });
    if (!r) return { kind: 'unavailable' };
    status = r.status;
    body = await r.json().catch(() => ({}));
  }
  const msg = pick(body);
  if (status >= 200 && status < 300) {
    return { kind: 'added', rows: body.receipts ?? fallback.ok_rows, pieces: body.pieces ?? fallback.pieces };
  }
  if (status === 409) return { kind: 'refused', message: msg || 'This file was already added. Nothing was added twice.' };
  return { kind: 'error', message: msg || 'The rows could not be added.' };
}

export async function downloadErrors(checkId: string, fake: boolean) {
  if (import.meta.env.DEV && fake) return (await loadFake()).fakeDownloadErrors(checkId);
  const r = await call(`/api/stock/errors.csv?check_id=${encodeURIComponent(checkId)}`);
  if (r && r.ok) saveText('rows-to-fix.csv', await r.text());
}

export { saveText };
