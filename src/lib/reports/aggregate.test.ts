import { describe, expect, it } from 'vitest';
import { byCashier, byCategory, byDay, byPayment, byProduct, byPromo, change, heatmap, summary, taxReport, voidsAndRefunds } from './aggregate';
import { dataFor } from './fixtures.test-helpers';

const all = dataFor('2026-10-30', '2026-10-31');

describe('summary', () => {
  it('follows the F5 definitions', () => {
    expect(summary(all)).toEqual({
      transactions: 4, gross_sales: 127000, refunds: 20000, net_revenue: 107000, tax: 9727, net_of_tax: 97273,
      cogs: 33000, gross_profit: 64273, avg_ticket: 31750, discounts: 3000, promo_orders: 1, voids: 1,
    });
  });

  it('keeps a sale on its day and its later refund on the refund day', () => {
    expect(summary(dataFor('2026-10-30', '2026-10-30'))).toMatchObject({ transactions: 3, gross_sales: 97000, refunds: 0, net_revenue: 97000 });
    expect(summary(dataFor('2026-10-31', '2026-10-31'))).toMatchObject({ transactions: 1, gross_sales: 30000, refunds: 20000, net_revenue: 10000 });
  });

  it('an empty period is all zeros', () => {
    expect(summary(dataFor('2026-01-01', '2026-01-01'))).toEqual({
      transactions: 0, gross_sales: 0, refunds: 0, net_revenue: 0, tax: 0, net_of_tax: 0, cogs: 0, gross_profit: 0, avg_ticket: 0, discounts: 0, promo_orders: 0, voids: 0,
    });
  });
});

describe('change', () => {
  it('is a fraction, or null when there is nothing to compare with', () => {
    expect(change(15, 10)).toBe(0.5);
    expect(change(5, 10)).toBe(-0.5);
    expect(change(10, 0)).toBeNull();
    expect(change(0, 0)).toBeNull();
    // from a loss (refund-only day) to a profit is up, not down
    expect(change(50000, -10000)).toBe(6);
    expect(change(-20000, -10000)).toBe(-1);
  });
});

describe('byDay', () => {
  it('puts a bill paid after midnight on the previous business day and fills every day', () => {
    expect(byDay(all)).toEqual([
      { date: '2026-10-30', transactions: 3, net_revenue: 97000, gross_profit: 62182 },
      { date: '2026-10-31', transactions: 1, net_revenue: 10000, gross_profit: 2091 },
    ]);
    expect(byDay(dataFor('2026-11-01', '2026-11-02')).map(d => d.transactions)).toEqual([0, 0]);
  });
});

describe('byPayment', () => {
  it('splits gross sales by method and lists refunds apart', () => {
    const p = byPayment(all);
    expect(p.methods.map(m => [m.method, m.transactions, m.amount])).toEqual([['cash', 2, 80000], ['edc', 1, 27000], ['qris', 1, 20000]]);
    expect(p.methods.reduce((s, m) => s + m.share, 0)).toBeCloseTo(1);
    expect(p.refunds).toEqual({ cash: 0, cashless: 20000 });
  });
});

describe('byProduct / byCategory', () => {
  it('groups by product id under the latest name, with revenue, COGS and gross profit', () => {
    const [kopi, croissant] = byProduct(all);
    expect(kopi).toEqual({ key: 'p1', name: 'Kopi Susu Gula Aren', qty: 4, revenue: 107000, net_of_tax: 97273, cogs: 28000, gross_profit: 69273 });
    expect(croissant).toMatchObject({ key: 'p2', qty: 1, revenue: 0, cogs: 5000, gross_profit: -5000 });
  });

  it('product gross profits add up to the summary', () => {
    expect(byProduct(all).reduce((s, p) => s + p.gross_profit, 0)).toBe(summary(all).gross_profit);
  });

  it('refunds count on the refund day, so each single day still adds up to the summary', () => {
    for (const day of ['2026-10-30', '2026-10-31']) {
      const d = dataFor(day, day);
      for (const rows of [byProduct(d), byCategory(d)]) {
        expect(rows.reduce((s, r) => s + r.revenue, 0)).toBe(summary(d).net_revenue);
        expect(rows.reduce((s, r) => s + r.gross_profit, 0)).toBe(summary(d).gross_profit);
      }
    }
    // Croissant sold on the 30th keeps its sale there; the refund lands on the 31st
    expect(byProduct(dataFor('2026-10-30', '2026-10-30')).find(r => r.key === 'p2')).toMatchObject({ revenue: 20000, gross_profit: 13182 });
    expect(byProduct(dataFor('2026-10-31', '2026-10-31')).find(r => r.key === 'p2')).toMatchObject({ name: 'Croissant', qty: 0, revenue: -20000, gross_profit: -18182 });
  });

  it('keeps revenue without tax for the margin', () => {
    expect(byProduct(all)[0].net_of_tax).toBe(97273);
  });

  it('rolls up by category', () => {
    expect(byCategory(all).map(c => [c.name, c.qty, c.revenue])).toEqual([['Kopi', 4, 107000], ['Makanan', 1, 0]]);
  });
});

describe('byCashier', () => {
  it('credits the employee who took payment', () => {
    expect(byCashier(all)).toEqual([
      { key: 'e1', name: 'Rani', transactions: 2, gross_sales: 77000, avg_ticket: 38500 },
      { key: 'e2', name: 'Dimas', transactions: 2, gross_sales: 50000, avg_ticket: 25000 },
    ]);
  });
});

describe('byPromo', () => {
  it('compares promo bills with bills without a promo', () => {
    expect(byPromo(all)).toEqual([
      { key: 'pr', name: 'Diskon 10%', uses: 1, discount: 3000, sales: 27000, avg_ticket: 27000 },
      { key: null, name: 'Tanpa promo', uses: 3, discount: 0, sales: 100000, avg_ticket: 33333 },
    ]);
  });
});

describe('taxReport', () => {
  it('nets refund tax on the refund day', () => {
    expect(taxReport(all)).toEqual([
      { date: '2026-10-30', tax_sales: 8818, tax_refunds: 0, tax_net: 8818 },
      { date: '2026-10-31', tax_sales: 2727, tax_refunds: 1818, tax_net: 909 },
    ]);
  });
});

describe('voidsAndRefunds', () => {
  it('lists both with totals', () => {
    const v = voidsAndRefunds(all);
    expect(v.voids.map(o => [o.code, o.void_reason, o.voided_by])).toEqual([['261030-A7-o4', 'Batal', 'Dimas']]);
    expect(v.refunds.map(r => r.amount)).toEqual([20000]);
    expect(v.totals).toEqual({ voids: 1, refunds: 1, refund_amount: 20000 });
  });
});

describe('heatmap', () => {
  it('uses the wall-clock WIB time of payment, Monday first', () => {
    const h = heatmap(all);
    expect(h[4][10].transactions).toBe(1); // Fri 10:00
    expect(h[5][1].transactions).toBe(1); // Sat 01:30 (business day Friday)
    expect(h[5][1].revenue).toBe(27000);
    expect(h.flat().reduce((s, c) => s + c.transactions, 0)).toBe(4);
  });

  it('counts a product\'s quantity when filtered', () => {
    const h = heatmap(all, { product: 'p1' });
    expect(h[4][10].transactions).toBe(2);
    expect(h[4][15].transactions).toBe(0);
  });
});

describe('heatmap product filter', () => {
  it('matches the product keys byProduct offers, incl. lines without a product id', () => {
    const d = dataFor('2026-10-30', '2026-10-31');
    const lost = { ...d.orders[0], id: 'o9', items: [{ ...d.orders[0].items[0], product_id: '', name: 'Teh Lama', qty: 3 }] };
    const withLost = { ...d, orders: [...d.orders, lost] };
    const key = byProduct(withLost).find(r => r.name === 'Teh Lama')!.key;
    expect(heatmap(withLost, { product: key }).flat().reduce((s, c) => s + c.transactions, 0)).toBe(3);
  });
});
