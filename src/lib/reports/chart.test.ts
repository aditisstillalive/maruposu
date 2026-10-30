import { describe, expect, it } from 'vitest';
import { compact, niceTicks } from './chart';

describe('chart axis', () => {
  it('uses clean rupiah ticks that cover the data', () => {
    expect(niceTicks(0, 38000)).toEqual([0, 10000, 20000, 30000, 40000]);
    expect(niceTicks(-5000, 20000)).toEqual([-10000, 0, 10000, 20000]);
  });
  it('never shows fractional rupiah, even when every day is zero', () => {
    expect(niceTicks(0, 0).every(Number.isInteger)).toBe(true);
    expect(niceTicks(0, 0).at(-1)).toBeGreaterThan(0);
  });
  it('compacts tick labels', () => {
    expect([compact(0), compact(40000), compact(1250000), compact(-5000)]).toEqual(['0', '40 rb', '1,3 jt', '-5 rb']);
  });
});
