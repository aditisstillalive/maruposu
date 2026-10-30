import { describe, expect, it } from 'vitest';
import { describePromo } from './promo-text';
import { billPercent, categoryAmount } from './fixtures.test-helpers';

describe('describePromo', () => {
  it('summarises a capped bill percentage with a minimum spend', () => {
    expect(describePromo({ ...billPercent(10), max_discount: 5000, min_spend: 50000 })).toBe('10% · maks Rp 5.000 · min. belanja Rp 50.000');
  });

  it('summarises a per-item amount on weekday happy hour', () => {
    const p = { ...categoryAmount('makanan', 5000), days: [1, 2, 3, 4, 5], time_start: '14:00', time_end: '16:00' };
    expect(describePromo(p, { makanan: 'Makanan' })).toBe('Rp 5.000/item · Makanan · Sen–Jum 14:00–16:00');
  });

  it('lists scattered days and shows the quota', () => {
    expect(describePromo({ ...billPercent(15), days: [0, 6], quota: 50 })).toBe('15% · Min, Sab · kuota 50');
  });
});
