import { describe, expect, it } from 'vitest';
import { hashMasterPin, isValidPinFormat, verifyMasterPin, nextThrottle, PIN_MAX_FAILURES } from './master-pin';

describe('isValidPinFormat', () => {
  it('accepts exactly six digits', () => {
    expect(isValidPinFormat('012345')).toBe(true);
  });

  it.each(['12345', '1234567', '12a456', ' 123456', '', null, 123456])('rejects %p', value => {
    expect(isValidPinFormat(value)).toBe(false);
  });
});

describe('hash and verify', () => {
  it('verifies the right PIN and rejects a wrong one', async () => {
    const hash = await hashMasterPin('482913');
    expect(hash).not.toContain('482913');
    expect(await verifyMasterPin('482913', hash)).toBe(true);
    expect(await verifyMasterPin('482914', hash)).toBe(false);
  });
});

describe('nextThrottle', () => {
  const now = new Date('2026-10-30T12:00:00Z');

  it('counts failures without locking below the limit', () => {
    expect(nextThrottle({ failures: 1, locked_until: null }, now)).toEqual({ failures: 2, locked_until: null });
  });

  it('locks for 15 minutes on reaching the limit', () => {
    const next = nextThrottle({ failures: PIN_MAX_FAILURES - 1, locked_until: null }, now);
    expect(next.failures).toBe(PIN_MAX_FAILURES);
    expect(next.locked_until?.toISOString()).toBe('2026-10-30T12:15:00.000Z');
  });

  it('starts counting again after a lock has expired', () => {
    const expired = { failures: PIN_MAX_FAILURES, locked_until: new Date('2026-10-30T11:00:00Z') };
    expect(nextThrottle(expired, now)).toEqual({ failures: 1, locked_until: null });
  });
});
