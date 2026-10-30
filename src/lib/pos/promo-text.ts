import type { PromoRule } from './types';
import { formatRupiah } from '@/lib/money';

const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function describeDays(days: number[]): string | null {
  if (!days.length || days.length === 7) return null;
  const sorted = [...days].sort((a, b) => a - b);
  const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (consecutive && sorted.length > 2) return `${DAY_NAMES[sorted[0]]}–${DAY_NAMES[sorted[sorted.length - 1]]}`;
  return sorted.map(d => DAY_NAMES[d]).join(', ');
}

/** One-line rule summary, e.g. "10% · maks Rp 5.000 · min. belanja Rp 50.000". */
export function describePromo(p: PromoRule, names: Record<string, string> = {}): string {
  const parts: string[] = [];
  if (p.kind === 'percent') parts.push(`${p.value / 100}%`);
  else parts.push(p.scope === 'bill' ? formatRupiah(p.value) : `${formatRupiah(p.value)}/item`);
  if (p.max_discount !== null) parts.push(`maks ${formatRupiah(p.max_discount)}`);
  const targets = p.scope === 'product' ? p.product_ids : p.scope === 'category' ? p.category_ids : [];
  if (targets.length) parts.push(targets.map(id => names[id] ?? '?').join(', '));
  if (p.min_spend > 0) parts.push(`min. belanja ${formatRupiah(p.min_spend)}`);
  const days = describeDays(p.days);
  const hours = p.time_start && p.time_end ? `${p.time_start}–${p.time_end}` : null;
  if (days || hours) parts.push([days, hours].filter(Boolean).join(' '));
  if (p.quota !== null) parts.push(`kuota ${p.quota}`);
  return parts.join(' · ');
}
