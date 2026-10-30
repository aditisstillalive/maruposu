import { describe, expect, it } from 'vitest';
import { reportTable } from './tables';
import { summary } from './aggregate';
import { dataFor } from './fixtures.test-helpers';

const all = dataFor('2026-10-30', '2026-10-31');

describe('reportTable', () => {
  it('daily rows add up to the summary', () => {
    const t = reportTable('daily', all);
    expect(t.rows.reduce((s, r) => s + (r[2] as number), 0)).toBe(summary(all).net_revenue);
  });

  it('lists every bill with its status and items, voids at zero', () => {
    const t = reportTable('transactions', all);
    expect(t.rows).toHaveLength(5);
    const voided = t.rows.find(r => r[2] === '261030-A7-o4')!;
    expect(voided[3]).toBe('Batal');
    expect(voided[12]).toBe(0);
    expect([voided[8], voided[9], voided[11]]).toEqual([0, 0, 0]); // a void adds no subtotal, discount or tax
    expect(t.rows.find(r => r[2] === '261030-A7-o3')![10]).toBe('Diskon 10%');
  });

  it('payments end with the refunds as negative amounts', () => {
    expect(reportTable('payments', all).rows.slice(-2)).toEqual([['Refund tunai', null, -0, null], ['Refund non-tunai', null, -20000, null]]);
  });

  it('writes percentages with a decimal comma for Indonesian Excel', () => {
    const pay = reportTable('payments', all).rows;
    expect(pay.find(r => r[0] === 'QRIS')![3]).toBe('15,7');
    expect(pay.find(r => r[0] === 'Tunai')![3]).toBe('63');
  });

  it('margin is gross profit over revenue without tax', () => {
    expect(reportTable('products', all).rows[0][5]).toBe('71,2');
  });
});
