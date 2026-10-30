import { describe, expect, it } from 'vitest';
import { longDateID } from './dates';

describe('longDateID', () => {
  it('writes a business day the Indonesian way', () => {
    expect(longDateID('2026-09-01')).toBe('Selasa, 01 September 2026');
    expect(longDateID('2026-10-31')).toBe('Sabtu, 31 Oktober 2026');
    expect(longDateID('2027-02-07')).toBe('Minggu, 07 Februari 2027');
  });
});
