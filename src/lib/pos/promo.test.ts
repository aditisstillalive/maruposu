import { describe, expect, it } from 'vitest';
import { promoActiveAt, promoDiscount } from './promo';
import { billPercent, categoryAmount, croissant, kopi } from './fixtures.test-helpers';

describe('promoDiscount', () => {
  it('10% bill promo capped by max_discount', () => {
    expect(promoDiscount({ ...billPercent(10), max_discount: 5000 }, [kopi, croissant])).toBe(5000);
  });

  it('10% bill promo without a cap', () => {
    expect(promoDiscount(billPercent(10), [kopi, croissant])).toBe(7600);
  });

  it('category amount promo applies per unit', () => {
    expect(promoDiscount(categoryAmount('makanan', 5000), [kopi, croissant])).toBe(5000);
    expect(promoDiscount(categoryAmount('kopi', 5000), [kopi, croissant])).toBe(10000);
  });

  it('an amount promo never exceeds what it applies to', () => {
    expect(promoDiscount(categoryAmount('makanan', 50000), [croissant])).toBe(20000);
  });

  it('product percent promo only counts matching lines', () => {
    const p = { ...billPercent(20), scope: 'product' as const, product_ids: [croissant.product_id] };
    expect(promoDiscount(p, [kopi, croissant])).toBe(4000);
  });

  it('min_spend not met gives no discount', () => {
    expect(promoDiscount({ ...billPercent(10), min_spend: 100000 }, [kopi])).toBe(0);
  });
});

describe('promoActiveAt', () => {
  it('happy hour 14:00–16:00 WIB on weekdays', () => {
    const p = { ...billPercent(20), days: [1, 2, 3, 4, 5], time_start: '14:00', time_end: '16:00' };
    expect(promoActiveAt(p, new Date('2026-10-30T07:30:00Z'))).toBe(true); // Fri 14:30 WIB
    expect(promoActiveAt(p, new Date('2026-10-30T09:00:00Z'))).toBe(false); // Fri 16:00 WIB
    expect(promoActiveAt(p, new Date('2026-11-01T07:30:00Z'))).toBe(false); // Sun
  });

  it('respects the date range', () => {
    const p = { ...billPercent(10), starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-11-02T00:00:00Z' };
    expect(promoActiveAt(p, new Date('2026-10-31T23:59:59Z'))).toBe(false);
    expect(promoActiveAt(p, new Date('2026-11-01T12:00:00Z'))).toBe(true);
    expect(promoActiveAt(p, new Date('2026-11-02T00:00:00Z'))).toBe(false);
  });

  it('used-up quota is inactive', () => {
    expect(promoActiveAt({ ...billPercent(10), quota: 5, used_count: 5 }, new Date())).toBe(false);
    expect(promoActiveAt({ ...billPercent(10), quota: 5, used_count: 4 }, new Date())).toBe(true);
  });

  it('a disabled promo is inactive', () => {
    expect(promoActiveAt({ ...billPercent(10), is_active: false }, new Date())).toBe(false);
  });
});
