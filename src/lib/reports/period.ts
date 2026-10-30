import { addDays } from '@/lib/wib';
import type { Period } from './types';

export const PRESETS = ['today', 'yesterday', '7d', '30d', 'this_month', 'last_month'] as const;
export type Preset = (typeof PRESETS)[number];

export const PRESET_LABEL: Record<Preset, string> = {
  today: 'Hari ini', yesterday: 'Kemarin', '7d': '7 hari', '30d': '30 hari', this_month: 'Bulan ini', last_month: 'Bulan lalu',
};

const DAY_MS = 24 * 60 * 60 * 1000;

function lastDayOfMonth(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10); // month is 1-based
}

/** A preset or a custom range → business days; `today` is the current business day. */
export function resolvePeriod(p: Preset | Period, today: string): Period {
  if (typeof p !== 'string') return p.from <= p.to ? p : { from: p.to, to: p.from };
  const [y, m] = today.split('-').map(Number);
  switch (p) {
    case 'today': return { from: today, to: today };
    case 'yesterday': return { from: addDays(today, -1), to: addDays(today, -1) };
    case '7d': return { from: addDays(today, -6), to: today };
    case '30d': return { from: addDays(today, -29), to: today };
    case 'this_month': return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'last_month': {
      const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
      return { from: `${py}-${String(pm).padStart(2, '0')}-01`, to: lastDayOfMonth(py, pm) };
    }
  }
}

export function daysIn(p: Period): string[] {
  const out: string[] = [];
  for (let d = p.from; d <= p.to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The same number of days right before `p`. */
export function previousPeriod(p: Period): Period {
  const n = Math.round((new Date(`${p.to}T00:00:00Z`).getTime() - new Date(`${p.from}T00:00:00Z`).getTime()) / DAY_MS) + 1;
  return { from: addDays(p.from, -n), to: addDays(p.from, -1) };
}
