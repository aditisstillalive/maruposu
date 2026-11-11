import type { CartLine, PaymentMethod, PromoRule, TaxRule, Totals } from './types';
import { allocate } from './allocate';
import { promoDiscount, promoLines } from './promo';
import { lineTotal } from './line';
import { voucherDiscount, type VoucherRule } from '@/lib/vouchers/rules';

export { lineTotal, unitPrice } from './line';

/**
 * Bill totals. The promo and the voucher are taken as given (the caller decides
 * whether they're usable); the promo comes off first, the voucher off what is
 * left, both before tax. `discount` is both together, `voucher_discount` the
 * voucher's part. Per line, `discount` is that line's share of the discount and
 * `paid` its share of the total, so refunds can be priced per item later.
 */
export function computeTotals(lines: CartLine[], promo: PromoRule | null, tax: TaxRule, voucher: VoucherRule | null = null): Totals {
  const gross = Object.fromEntries(lines.map(l => [l.id, lineTotal(l)]));
  const subtotal = Object.values(gross).reduce((s, v) => s + v, 0);

  const promoOff = promo ? promoDiscount(promo, lines) : 0;
  const eligible = promo ? promoLines(promo, lines) : [];
  const voucher_discount = voucher ? voucherDiscount(voucher, subtotal - promoOff) : 0;
  const discount = promoOff + voucher_discount;

  const net = subtotal - discount;
  const tax_amount = tax.inclusive
    ? Math.round((net * tax.rate_bp) / (10000 + tax.rate_bp))
    : Math.round((net * tax.rate_bp) / 10000);
  const total = tax.inclusive ? net : net + tax_amount;

  return {
    subtotal, discount, voucher_discount, tax: tax_amount, total,
    lines: splitLineMoney(lines, eligible.map(l => l.id), promoOff, total, voucher_discount),
  };
}

/**
 * Per-line share of a bill's discount and of its total. The promo's `discount`
 * goes over the lines it applied to, a voucher over every line (after the
 * promo), the total over every line after both. Shares always add up exactly.
 */
export function splitLineMoney(lines: CartLine[], discountedIds: string[], discount: number, total: number, voucherDiscount = 0): Totals['lines'] {
  const gross = Object.fromEntries(lines.map(l => [l.id, lineTotal(l)]));
  const promoShare = allocate(discount, Object.fromEntries(discountedIds.map(id => [id, gross[id] ?? 0])));
  const afterPromo = Object.fromEntries(lines.map(l => [l.id, gross[l.id] - (promoShare[l.id] ?? 0)]));
  const voucherShare = allocate(voucherDiscount, afterPromo);
  const lineDiscount = Object.fromEntries(lines.map(l => [l.id, (promoShare[l.id] ?? 0) + (voucherShare[l.id] ?? 0)]));
  const lineNet = Object.fromEntries(lines.map(l => [l.id, gross[l.id] - lineDiscount[l.id]]));
  const linePaid = allocate(total, lineNet);
  return Object.fromEntries(lines.map(l => [l.id, { discount: lineDiscount[l.id] ?? 0, paid: linePaid[l.id] }]));
}

/** Error message for the cashier, or null when the payment can go through. */
export function validatePayment(method: PaymentMethod, total: number, cashReceived: number | null): string | null {
  if (method !== 'cash') return null;
  if (cashReceived === null || !Number.isFinite(cashReceived)) return 'Isi uang diterima';
  if (cashReceived < total) return 'Uang diterima kurang dari total';
  return null;
}
