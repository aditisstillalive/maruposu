import { describe, expect, it } from 'vitest';
import { busiest, hourRange, peakParams } from './peak';

const grid = (cells: [number, number, number][]) => {
  const g = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ transactions: 0, revenue: 0 })));
  for (const [d, h, n] of cells) g[d][h] = { transactions: n, revenue: n * 1000 };
  return g;
};

describe('peak hours', () => {
  it('shows 06–23 by default', () => {
    expect(hourRange(grid([]))).toEqual(Array.from({ length: 18 }, (_, i) => i + 6));
    expect(hourRange(grid([[0, 10, 2]]))[0]).toBe(6);
  });
  it('widens to data outside opening hours, one hour of margin', () => {
    const h = hourRange(grid([[5, 1, 1]])); // Sat 01:00
    expect(h[0]).toBe(0);
    expect(h[h.length - 1]).toBe(23);
    expect(hourRange(grid([[2, 4, 1]]))[0]).toBe(3);
  });
  it('finds the busiest slot, earliest on ties, none when empty', () => {
    expect(busiest(grid([[4, 15, 3], [5, 10, 3], [1, 9, 1]]))).toEqual({ day: 4, hour: 15, transactions: 3 });
    expect(busiest(grid([]))).toBeNull();
  });
});

describe('peakParams', () => {
  it('defaults to 30 days unless a preset or a full custom range is given', () => {
    expect(peakParams({})).toEqual({ preset: '30d' });
    expect(peakParams({ from: '2026-10-01' })).toEqual({ from: '2026-10-01', preset: '30d' });
    expect(peakParams({ preset: '7d', product: 'p1' })).toEqual({ preset: '7d', product: 'p1' });
    expect(peakParams({ from: '2026-10-01', to: '2026-10-05' })).toEqual({ from: '2026-10-01', to: '2026-10-05' });
  });
});
