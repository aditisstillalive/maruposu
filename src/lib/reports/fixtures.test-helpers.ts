import type { ReportData, ReportOrder, ReportRefund } from './types';

const base = (o: Partial<ReportOrder> & Pick<ReportOrder, 'id' | 'business_date' | 'status'>): ReportOrder => ({
  code: `261030-A7-${o.id}`, number: 1, order_type: 'takeaway', customer_name: null, created_by: 'e1', paid_by: 'e1', paid_at: null,
  total: 0, subtotal: 0, discount: 0, tax: 0, promo_id: null, promo_name: null, payment_method: null, void_reason: null, voided_by: null, items: [],
  ...o,
});

const item = (product_id: string, category_id: string, category_name: string, name: string, qty: number, paid: number, cogs: number, refunded = 0) => ({
  product_id, category_id, category_name, name, qty, paid, cogs, refunded_qty: refunded ? qty : 0, refunded_amount: refunded, options: [],
});

export const orders: ReportOrder[] = [
  base({ id: 'o1', business_date: '2026-10-30', status: 'paid', payment_method: 'cash', total: 50000, subtotal: 50000, tax: 4545, paid_by: 'e1',
    paid_at: '2026-10-30T03:00:00.000Z', items: [item('p1', 'c1', 'Kopi', 'Kopi', 2, 50000, 14000)] }),
  base({ id: 'o2', business_date: '2026-10-30', status: 'refunded', payment_method: 'qris', total: 20000, subtotal: 20000, tax: 1818, paid_by: 'e2',
    paid_at: '2026-10-30T08:00:00.000Z', items: [item('p2', 'c2', 'Makanan', 'Croissant', 1, 20000, 5000, 20000)] }),
  // paid 01:30 WIB on Sat 31 Oct, still business day 30 Oct
  base({ id: 'o3', business_date: '2026-10-30', status: 'paid', payment_method: 'edc', total: 27000, subtotal: 30000, discount: 3000, tax: 2455,
    promo_id: 'pr', promo_name: 'Diskon 10%', paid_by: 'e1', paid_at: '2026-10-30T18:30:00.000Z', items: [item('p1', 'c1', 'Kopi', 'Kopi Susu', 1, 27000, 7000)] }),
  base({ id: 'o4', business_date: '2026-10-30', status: 'void', void_reason: 'Batal', voided_by: 'e2', paid_by: null, items: [item('p2', 'c2', 'Makanan', 'Croissant', 1, 0, 0)] }),
  base({ id: 'o5', business_date: '2026-10-31', status: 'paid', payment_method: 'cash', total: 30000, subtotal: 30000, tax: 2727, paid_by: 'e2',
    paid_at: '2026-10-31T02:00:00.000Z', items: [item('p1', 'c1', 'Kopi', 'Kopi Susu Gula Aren', 1, 30000, 7000)] }),
];

export const refunds: ReportRefund[] = [
  { id: 'r1', order_id: 'o2', order_code: '261030-A7-o2', business_date: '2026-10-31', method: 'cashless', amount: 20000, tax: 1818, reason: 'Basi',
    employee_id: 'e2', created_at: '2026-10-31T03:00:00.000Z', items: [{ name: 'Croissant', qty: 1, amount: 20000 }] },
];

export const employees = { e1: 'Rani', e2: 'Dimas' };

/** Report data limited to a period, the way the loader would return it. */
export function dataFor(from: string, to: string): ReportData {
  return {
    period: { from, to },
    orders: orders.filter(o => o.business_date >= from && o.business_date <= to),
    refunds: refunds.filter(r => r.business_date >= from && r.business_date <= to),
    employees,
  };
}
