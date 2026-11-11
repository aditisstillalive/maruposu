import { describe, expect, it } from 'vitest';
import { computeTotals, lineTotal, unitPrice, validatePayment } from './pricing';
import { billPercent, croissant, kopi, line, tax10excl, tax10incl } from './fixtures.test-helpers';
import type { VoucherRule } from '@/lib/vouchers/rules';

const voucher = (v: Partial<VoucherRule>): VoucherRule => ({ batch_name: 'Launch', kind: 'amount', value: 20000, max_discount: null, min_spend: 0, expires_at: '2099-01-01T00:00:00.000Z', channels: 'both', ...v });

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
    expect(computeTotals([], null, tax10incl)).toEqual({ subtotal: 0, discount: 0, voucher_discount: 0, tax: 0, total: 0, lines: {} });
  });
});

describe('computeTotals with a voucher', () => {
  it('takes the voucher off like a bill promo, before tax', () => {
    expect(computeTotals([kopi, croissant], null, tax10incl, voucher({ value: 20000 }))).toMatchObject({ subtotal: 76000, discount: 20000, voucher_discount: 20000, total: 56000, tax: 5091 });
  });

  it('applies after the promo, on what is left', () => {
    // 10% promo: 76.000 - 7.600 = 68.400; 10% voucher on that = 6.840
    const t = computeTotals([kopi, croissant], billPercent(10), tax10incl, voucher({ kind: 'percent', value: 1000 }));
    expect(t).toMatchObject({ discount: 7600 + 6840, voucher_discount: 6840, total: 61560 });
  });

  it('checks the minimum spend after the promo', () => {
    const t = computeTotals([kopi, croissant], billPercent(10), tax10incl, voucher({ min_spend: 70000 }));
    expect(t).toMatchObject({ discount: 7600, voucher_discount: 0, total: 68400 });
  });

  it('never makes the bill negative', () => {
    expect(computeTotals([croissant], null, tax10incl, voucher({ value: 50000 }))).toMatchObject({ discount: 20000, voucher_discount: 20000, total: 0, tax: 0 });
  });

  it('spreads the voucher over every line so refunds stay exact', () => {
    const t = computeTotals([kopi, croissant, line({ id: 'c', base_price: 18333, qty: 3 })], billPercent(10), tax10excl, voucher({ value: 15000 }));
    expect(Object.values(t.lines).reduce((s, l) => s + l.discount, 0)).toBe(t.discount);
    expect(Object.values(t.lines).reduce((s, l) => s + l.paid, 0)).toBe(t.total);
    expect(t.lines.b.discount).toBeGreaterThan(0);
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
