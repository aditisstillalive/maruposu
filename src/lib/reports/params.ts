import { addDays, isValidDate } from '@/lib/wib';
import { PRESETS, resolvePeriod, type Preset } from './period';
import type { Period } from './types';

const MAX_DAYS = 366;

/** `?preset=` or `?from=&to=` (business days) → a period; defaults to today. */
export function periodFromParams(sp: Record<string, string | string[] | undefined>, today: string, maxDays = MAX_DAYS): { preset: Preset | null; period: Period } {
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined);
  const from = one('from');
  const to = one('to');
  if (isValidDate(from) && isValidDate(to)) {
    const p = resolvePeriod({ from, to }, today);
    const earliest = addDays(p.to, -(maxDays - 1));
    return { preset: null, period: { from: p.from < earliest ? earliest : p.from, to: p.to } };
  }
  const preset = (PRESETS as readonly string[]).includes(one('preset') ?? '') ? (one('preset') as Preset) : 'today';
  return { preset, period: resolvePeriod(preset, today) };
}
