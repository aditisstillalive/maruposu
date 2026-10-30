import { describe, expect, it } from 'vitest';
import { computeTotals, lineTotal, unitPrice, validatePayment } from './pricing';
import { billPercent, croissant, kopi, line, tax10excl, tax10incl } from './fixtures.test-helpers';

describe('line prices', () => {
  it('prices a line with options', () => {
    expect(unitPrice(kopi)).toBe(28000);
    expect(lineTotal(kopi)).toBe(56000);
  });
});

describe('computeTotals', () => {
  it('inclusive tax is carved out of the total', () => {
    const t = computeTotals([kopi, croissant], null, tax10incl);
    expect(t).toMatchObject({ subtotal: 76000, discount: 0, total: 76000, tax: 6909 });
  });

  it('exclusive tax is added on top', () => {
    expect(computeTotals([croissant], null, tax10excl)).toMatchObject({ total: 22000, tax: 2000 });
  });

  it('applies the promo before tax', () => {
    expect(computeTotals([kopi, croissant], billPercent(10), tax10incl)).toMatchObject({ discount: 7600, total: 68400, tax: 6218 });
  });

  it('line paid amounts sum exactly to the total', () => {
    const t = computeTotals([kopi, croissant, line({ id: 'c', base_price: 18333, qty: 3 })], billPercent(10), tax10excl);
    expect(Object.values(t.lines).reduce((s, l) => s + l.paid, 0)).toBe(t.total);
    expect(Object.values(t.lines).reduce((s, l) => s + l.discount, 0)).toBe(t.discount);
  });

  it('an empty bill is all zeros', () => {
    expect(computeTotals([], null, tax10incl)).toEqual({ subtotal: 0, discount: 0, tax: 0, total: 0, lines: {} });
  });
});

describe('validatePayment', () => {
  it('needs enough cash', () => {
    expect(validatePayment('cash', 76000, 50000)).toBe('Uang diterima kurang dari total');
    expect(validatePayment('cash', 76000, null)).toBe('Isi uang diterima');
    expect(validatePayment('cash', 76000, 76000)).toBeNull();
    expect(validatePayment('cash', 76000, 100000)).toBeNull();
  });

  it('cashless needs no amount', () => {
    expect(validatePayment('qris', 76000, null)).toBeNull();
    expect(validatePayment('edc', 76000, null)).toBeNull();
  });
});
