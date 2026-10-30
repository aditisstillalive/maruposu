import { describe, expect, it } from 'vitest';
import { countedTotal, shiftSummary, varianceLabel } from './shift';
import type { CashMoveDoc, OrderDoc, RefundDoc } from './types';

const SHIFT = { id: 's1', opening_float: 200000 };

function order(id: string, status: OrderDoc['status'], method: OrderDoc['payment_method'], total: number, extra: Partial<OrderDoc> = {}): OrderDoc {
  return {
    id, shift_id: 's1', code: `261030-A7-${id}`, number: 1, business_date: '2026-10-30', status, order_type: 'takeaway',
    customer_name: null, table_no: null, created_by: 'e', paid_by: method ? 'e' : null, subtotal: total, discount: 0,
    tax: Math.round(total / 11), total, promo_id: null, promo_name: null, payment_method: method, cash_received: null,
    change: null, payment_ref: null, paid_at: null, void_reason: null, created_at: '2026-10-30T02:00:00.000Z', items: [], refunds: [],
    ...extra,
  };
}

const move = (kind: CashMoveDoc['kind'], amount: number): CashMoveDoc => ({
  id: `${kind}-${amount}`, shift_id: 's1', kind, amount, note: '', employee_id: 'e', created_at: '2026-10-30T03:00:00.000Z',
});

const refund = (method: RefundDoc['method'], amount: number): RefundDoc => ({
  id: `r-${method}-${amount}`, shift_id: 's1', method, amount, tax: 0, reason: 'x', employee_id: 'e', created_at: '2026-10-30T03:00:00.000Z', items: [],
});

describe('countedTotal', () => {
  it('adds notes by value and the coin total', () => {
    expect(countedTotal({ notes: { '100000': 2, '5000': 3 }, coins: 1500 })).toBe(216500);
  });

  it('ignores missing and unknown denominations', () => {
    expect(countedTotal({ notes: { '75000': 4 }, coins: 0 })).toBe(0);
  });
});

describe('shiftSummary', () => {
  it('expected cash = float + cash sales + paid in − paid out − cash refunds', () => {
    const orders = [
      order('a', 'paid', 'cash', 76000),
      order('b', 'paid', 'cash', 20000),
      order('c', 'paid', 'qris', 20000),
      order('d', 'void', null, 0),
      order('e', 'open', null, 0),
    ];
    const moves = [move('paid_in', 50000), move('paid_out', 20000), move('refund_out', 25200)];
    const s = shiftSummary(SHIFT, orders, moves, [refund('cash', 25200)]);
    expect(s).toMatchObject({
      opening_float: 200000, transactions: 3, cash_sales: 96000, edc_sales: 0, qris_sales: 20000, gross_sales: 116000,
      voids: 1, paid_in: 50000, paid_out: 20000, refunds_cash: 25200, refunds_cashless: 0, expected_cash: 300800,
    });
  });

  it('refunded orders still count their cash sale; the refund is a separate cash-out', () => {
    const s = shiftSummary(SHIFT, [order('a', 'refunded', 'cash', 20000)], [move('refund_out', 20000)], [refund('cash', 20000)]);
    expect(s).toMatchObject({ cash_sales: 20000, refunds_cash: 20000, expected_cash: 200000 });
  });

  it('a cash refund in this shift for an older order comes out of this drawer', () => {
    const s = shiftSummary(SHIFT, [], [move('refund_out', 20000)], [refund('cash', 20000)]);
    expect(s).toMatchObject({ refunds_cash: 20000, expected_cash: 180000, transactions: 0 });
  });

  it('cashless refunds do not touch the drawer', () => {
    const s = shiftSummary(SHIFT, [order('a', 'refunded', 'qris', 20000)], [], [refund('cashless', 20000)]);
    expect(s).toMatchObject({ refunds_cashless: 20000, expected_cash: 200000 });
  });
});

describe('varianceLabel', () => {
  it('reads the difference for the cashier', () => {
    expect(varianceLabel(0)).toBe('Pas');
    expect(varianceLabel(5000)).toBe('Lebih Rp 5.000');
    expect(varianceLabel(-2000)).toBe('Kurang Rp 2.000');
  });
});
