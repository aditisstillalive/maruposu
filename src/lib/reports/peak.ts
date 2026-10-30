import type { heatmap } from './aggregate';

type Grid = ReturnType<typeof heatmap>;
type Params = Record<string, string | string[] | undefined>;

/** One day says little about patterns: without a preset or a full range, show the last 30 days. */
export function peakParams(sp: Params): Params {
  return sp.preset || (sp.from && sp.to) ? sp : { ...sp, preset: '30d' };
}

export const DAY_NAMES = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const OPEN = 6;
const CLOSE = 23;

/** Hours to show: 06–23, widened to any hour with data plus one hour either side. */
export function hourRange(grid: Grid): number[] {
  const used = [...Array(24).keys()].filter(h => grid.some(day => day[h].transactions > 0));
  const from = used.length ? Math.max(0, Math.min(OPEN, used[0] - 1)) : OPEN;
  const to = used.length ? Math.min(23, Math.max(CLOSE, used[used.length - 1] + 1)) : CLOSE;
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/** The busiest day × hour (Monday first, earliest on ties), or null with no sales. */
export function busiest(grid: Grid): { day: number; hour: number; transactions: number } | null {
  let best: { day: number; hour: number; transactions: number } | null = null;
  grid.forEach((row, day) => row.forEach((c, hour) => {
    if (c.transactions > 0 && (!best || c.transactions > best.transactions)) best = { day, hour, transactions: c.transactions };
  }));
  return best;
}
