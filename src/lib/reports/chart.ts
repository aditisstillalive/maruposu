// Axis helpers for the rupiah charts.

/** 1250000 → "1,3 jt"; axis ticks only, values elsewhere are exact rupiah. */
export function compact(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? '-' : '';
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  if (a >= 1_000) return `${s}${(a / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 0 })} rb`;
  return `${n}`;
}

/** Round ticks covering [min, max]; at least Rp 1.000 tall so an all-zero range has whole-rupiah ticks. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const top = Math.max(max, min + 1000);
  const raw = (top - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw)!;
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= top + step / 2; v += step) out.push(v);
  return out;
}
