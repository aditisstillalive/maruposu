import type { TaxRule } from './types';

/**
 * Money returned for `refundQty` units of a paid line. The last units refunded
 * get whatever is left, so a line refunded in parts adds up to exactly `paid`.
 */
export function refundLineAmount(
  line: { qty: number; paid: number },
  refundQty: number,
  already: { qty: number; amount: number }
): number {
  if (already.qty + refundQty >= line.qty) return line.paid - already.amount;
  return Math.round((line.paid * refundQty) / line.qty);
}

/** Tax inside a refunded amount. `paid` always includes tax, inclusive or not. */
export function refundTax(amount: number, tax: TaxRule): number {
  return Math.round((amount * tax.rate_bp) / (10000 + tax.rate_bp));
}
