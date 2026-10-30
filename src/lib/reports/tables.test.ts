import { describe, expect, it } from 'vitest';
import { reportTable, tableCsv } from './tables';
import { summary } from './aggregate';
import { dataFor } from './fixtures.test-helpers';

const all = dataFor('2026-10-30', '2026-10-31');

describe('reportTable', () => {
  it('daily rows are long Indonesian dates and add up to the summary', () => {
    const t = reportTable('daily', all);
    expect(t.rows.map(r => r[0])).toEqual(['Jumat, 30 Oktober 2026', 'Sabtu, 31 Oktober 2026']);
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

  it('payments list the refunds as negative amounts before the total', () => {
    expect(reportTable('payments', all).rows.slice(-3, -1)).toEqual([['Refund tunai', null, -0, null], ['Refund non-tunai', null, -20000, null]]);
  });

  it('keeps percentages as fractions with a column kind, for Excel', () => {
    const t = reportTable('payments', all);
    expect(t.kinds).toEqual(['text', 'number', 'rupiah', 'pct']);
    expect(t.rows.find(r => r[0] === 'QRIS')![3]).toBeCloseTo(20000 / 127000);
  });

  it('writes CSV percentages with a decimal comma for Indonesian Excel', () => {
    const csv = tableCsv(reportTable('payments', all));
    expect(csv).toContain('\r\nQRIS;1;20000;15,7\r\n');
    expect(csv).toContain('\r\nTunai;2;80000;63\r\n');
  });

  it('margin is gross profit over revenue without tax', () => {
    expect(reportTable('products', all).rows[0][5]).toBeCloseTo(69273 / 97273);
  });

  it('has a summary sheet with the screen\'s lines', () => {
    const t = reportTable('summary', all);
    expect(t.rows.find(r => r[0] === 'Pendapatan bersih')![1]).toBe(107000);
    expect(t.rows.find(r => r[0] === 'Transaksi')![1]).toEqual({ value: 4, kind: 'number' });
  });

  it('ends with the same totals as the screen', () => {
    expect(reportTable('payments', all).rows.at(-1)).toEqual(['Bersih', 4, 107000, null]);
    const products = reportTable('products', all).rows;
    expect(products.at(-1)!.slice(0, 5)).toEqual(['Total', 5, 107000, 33000, 64273]);
  });
});
