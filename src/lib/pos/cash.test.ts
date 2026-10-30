import { describe, expect, it } from 'vitest';
import { cashSuggestions } from './cash';

describe('cashSuggestions', () => {
  it('rounds up to the next notes a customer is likely to hand over', () => {
    expect(cashSuggestions(68400)).toEqual([70000, 80000, 100000]);
    expect(cashSuggestions(22000)).toEqual([30000, 40000, 50000, 100000]);
  });

  it('skips amounts equal to the total (that is "Uang pas")', () => {
    expect(cashSuggestions(50000)).toEqual([60000, 100000]);
  });

  it('never offers more than four', () => {
    expect(cashSuggestions(1000).length).toBeLessThanOrEqual(4);
  });
});
