/**
 * Small RFC-4180-ish CSV reader: quotes, doubled quotes, CRLF. Drops fully empty lines unless
 * keepBlank, which keeps them so row numbers match the server's (header = row 1).
 */
export function parseCsv(text: string, keepBlank = false): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (keepBlank || row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

export function toCsvLine(cells: (string | number)[]): string {
  return cells.map((v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',');
}

/**
 * Reads a CSV upload on the client before it is sent. Drops a trailing "error" column (the
 * "rows to fix" download adds it) so that file can go straight back in, and lists the data rows
 * (file line numbers) received on or before the stock count date. Sample example rows are skipped.
 */
export function prepareCsv(text: string, asOf: string, sampleText: string | null) {
  const rows = parseCsv(text, true);
  const header = rows[0] ?? [];
  const stripped = header.length === 9 && (header[8] ?? '').trim().toLowerCase() === 'error';
  const clean = stripped ? rows.map((r) => r.slice(0, 8)) : rows;
  const key = (r: string[]) => toCsvLine(r.map((c) => (c ?? '').trim()));
  const samples = new Set(sampleText ? parseCsv(sampleText).slice(1).map(key) : []);
  const early: number[] = [];
  clean.slice(1).forEach((r, i) => {
    if (samples.has(key(r))) return;
    const d = (r[7] ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d <= asOf) early.push(i + 2);
  });
  return { text: stripped ? clean.map(toCsvLine).join('\n') + '\n' : text, stripped, early };
}

export function saveText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
