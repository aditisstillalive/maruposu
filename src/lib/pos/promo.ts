import type { CartLine, PromoRule } from './types';
import { lineTotal } from './line';
import { formatRupiah } from '@/lib/money';

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export function promoActiveAt(p: PromoRule, now: Date): boolean {
  if (!p.is_active) return false;
  if (p.quota !== null && p.used_count >= p.quota) return false;
  const t = now.getTime();
  if (p.starts_at && t < new Date(p.starts_at).getTime()) return false;
  if (p.ends_at && t >= new Date(p.ends_at).getTime()) return false;

  const wib = new Date(t + WIB_OFFSET_MS);
  if (p.days.length && !p.days.includes(wib.getUTCDay())) return false;
  if (p.time_start && p.time_end) {
    const hhmm = wib.toISOString().slice(11, 16);
    if (hhmm < p.time_start || hhmm >= p.time_end) return false;
  }
  return true;
}

/** Lines the promo applies to (every line for a bill promo). */
export function promoLines(p: PromoRule, lines: CartLine[]): CartLine[] {
  if (p.scope === 'product') return lines.filter(l => p.product_ids.includes(l.product_id));
  if (p.scope === 'category') return lines.filter(l => p.category_ids.includes(l.category_id));
  return lines;
}

/** Discount in rupiah; 0 when the minimum spend isn't met. Doesn't check timing. */
export function promoDiscount(p: PromoRule, lines: CartLine[]): number {
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  if (subtotal < p.min_spend) return 0;

  const eligible = promoLines(p, lines);
  const base = eligible.reduce((s, l) => s + lineTotal(l), 0);
  let discount: number;
  if (p.kind === 'percent') discount = Math.round((base * p.value) / 10000);
  else if (p.scope === 'bill') discount = p.value;
  else discount = p.value * eligible.reduce((s, l) => s + l.qty, 0);

  if (p.max_discount !== null) discount = Math.min(discount, p.max_discount);
  return Math.max(0, Math.min(discount, base));
}

export type PromoAvailability = { ok: true; discount: number } | { ok: false; reason: string };

/** Whether the cashier can use the promo on this bill now, and why not. */
export function promoAvailability(p: PromoRule, lines: CartLine[], now: Date): PromoAvailability {
  if (p.quota !== null && p.used_count >= p.quota) return { ok: false, reason: 'Kuota sudah habis' };
  if (!promoActiveAt(p, now)) return { ok: false, reason: 'Tidak berlaku sekarang' };
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  if (subtotal < p.min_spend) return { ok: false, reason: `Min. belanja ${formatRupiah(p.min_spend)}` };
  if (!promoLines(p, lines).length) return { ok: false, reason: 'Tidak ada item yang cocok' };
  const discount = promoDiscount(p, lines);
  return discount > 0 ? { ok: true, discount } : { ok: false, reason: 'Tidak ada item yang cocok' };
}
