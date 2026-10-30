import type { CartLine, PaymentMethod, PromoRule, TaxRule, Totals } from './types';
import { allocate } from './allocate';
import { promoDiscount, promoLines } from './promo';
import { lineTotal } from './line';

export { lineTotal, unitPrice } from './line';

/**
 * Bill totals. The promo is taken as given (the caller decides whether it's
 * active); its discount comes off before tax. Per line, `discount` is that
 * line's share of the discount and `paid` its share of the total, so refunds
 * can be priced per item later.
 */
export function computeTotals(lines: CartLine[], promo: PromoRule | null, tax: TaxRule): Totals {
  const gross = Object.fromEntries(lines.map(l => [l.id, lineTotal(l)]));
  const subtotal = Object.values(gross).reduce((s, v) => s + v, 0);

  const discount = promo ? promoDiscount(promo, lines) : 0;
  const eligible = promo ? promoLines(promo, lines) : [];
  const lineDiscount = allocate(discount, Object.fromEntries(eligible.map(l => [l.id, gross[l.id]])));

  const net = subtotal - discount;
  const tax_amount = tax.inclusive
    ? Math.round((net * tax.rate_bp) / (10000 + tax.rate_bp))
    : Math.round((net * tax.rate_bp) / 10000);
  const total = tax.inclusive ? net : net + tax_amount;

  const lineNet = Object.fromEntries(lines.map(l => [l.id, gross[l.id] - (lineDiscount[l.id] ?? 0)]));
  const linePaid = allocate(total, lineNet);

  return {
    subtotal,
    discount,
    tax: tax_amount,
    total,
    lines: Object.fromEntries(lines.map(l => [l.id, { discount: lineDiscount[l.id] ?? 0, paid: linePaid[l.id] }])),
  };
}

/** Error message for the cashier, or null when the payment can go through. */
export function validatePayment(method: PaymentMethod, total: number, cashReceived: number | null): string | null {
  if (method !== 'cash') return null;
  if (cashReceived === null || !Number.isFinite(cashReceived)) return 'Isi uang diterima';
  if (cashReceived < total) return 'Uang diterima kurang dari total';
  return null;
}
