type Cell = string | number | null | undefined;

const cell = (v: Cell) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * CSV that Excel opens column by column in Indonesian locales: UTF-8 with BOM,
 * `;` between cells, CRLF between rows.
 */
export function toCsv(headers: string[], rows: Cell[][]): string {
  return '﻿' + [headers, ...rows].map(r => r.map(cell).join(';') + '\r\n').join('');
}
