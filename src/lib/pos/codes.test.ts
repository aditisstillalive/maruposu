import { describe, expect, it } from 'vitest';
import { businessDateWIB, orderCode } from './codes';

describe('businessDateWIB', () => {
  it('business date rolls at 04:00 WIB', () => {
    expect(businessDateWIB(new Date('2026-10-30T20:59:00Z'))).toBe('2026-10-30'); // 03:59 WIB 31 Okt
    expect(businessDateWIB(new Date('2026-10-30T21:00:00Z'))).toBe('2026-10-31'); // 04:00 WIB 31 Okt
    expect(businessDateWIB(new Date('2026-10-30T01:00:00Z'))).toBe('2026-10-30'); // 08:00 WIB
  });
});

describe('orderCode', () => {
  it('formats date, device tag and sequence', () => {
    expect(orderCode('2026-10-30', 'A7', 14)).toBe('261030-A7-014');
    expect(orderCode('2026-01-05', 'B2', 1234)).toBe('260105-B2-1234');
  });
});
