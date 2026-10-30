import { formatRupiah } from '@/lib/money';
import type { CashMoveDoc, OrderDoc, RefundDoc, ShiftDoc } from './types';

/** Banknotes counted one by one at closing; coins are entered as one total. */
export const DENOMINATIONS = [100000, 50000, 20000, 10000, 5000, 2000, 1000] as const;

export type Denominations = { notes: Record<string, number>; coins: number };

export const emptyDenominations = (): Denominations => ({ notes: {}, coins: 0 });

export function countedTotal(d: Denominations): number {
  return DENOMINATIONS.reduce((s, v) => s + v * (d.notes[String(v)] ?? 0), 0) + d.coins;
}

export type ShiftSummary = {
  opening_float: number;
  transactions: number;
  cash_sales: number;
  edc_sales: number;
  qris_sales: number;
  gross_sales: number;
  discounts: number;
  tax: number;
  voids: number;
  refunds_cash: number;
  refunds_cashless: number;
  paid_in: number;
  paid_out: number;
  expected_cash: number;
};

/**
 * Totals of one shift. `orders` are the shift's own bills (its sales); `moves`
 * and `refundsHere` are what happened in this shift's drawer, which may include
 * refunds of older bills. Used by the tablet (variance, report) and the server
 * (the official figures), so both always agree.
 */
export function shiftSummary(
  shift: Pick<ShiftDoc, 'id' | 'opening_float'>,
  orders: OrderDoc[],
  moves: CashMoveDoc[],
  refundsHere: RefundDoc[]
): ShiftSummary {
  const sold = orders.filter(o => o.shift_id === shift.id && (o.status === 'paid' || o.status === 'refunded'));
  const by = (method: OrderDoc['payment_method']) => sold.filter(o => o.payment_method === method).reduce((s, o) => s + o.total, 0);
  const sum = (kind: CashMoveDoc['kind']) => moves.filter(m => m.kind === kind).reduce((s, m) => s + m.amount, 0);
  const refunds = (method: RefundDoc['method']) => refundsHere.filter(r => r.method === method).reduce((s, r) => s + r.amount, 0);

  const cash_sales = by('cash');
  const paid_in = sum('paid_in');
  const paid_out = sum('paid_out');
  return {
    opening_float: shift.opening_float,
    transactions: sold.length,
    cash_sales,
    edc_sales: by('edc'),
    qris_sales: by('qris'),
    gross_sales: sold.reduce((s, o) => s + o.total, 0),
    discounts: sold.reduce((s, o) => s + o.discount, 0),
    tax: sold.reduce((s, o) => s + o.tax, 0),
    voids: orders.filter(o => o.status === 'void').length,
    refunds_cash: refunds('cash'),
    refunds_cashless: refunds('cashless'),
    paid_in,
    paid_out,
    expected_cash: shift.opening_float + cash_sales + paid_in - paid_out - sum('refund_out'),
  };
}

export function varianceLabel(variance: number): string {
  if (variance === 0) return 'Pas';
  return variance > 0 ? `Lebih ${formatRupiah(variance)}` : `Kurang ${formatRupiah(-variance)}`;
}
