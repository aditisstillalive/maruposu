import { describe, expect, it } from 'vitest';
import { businessDayEnd, signDeviceToken, verifyDeviceToken } from './device-session';

const SECRET = 'test-secret-test-secret-test-secret';

describe('businessDayEnd', () => {
  it('ends at 04:00 WIB the next morning when unlocked in the evening', () => {
    // 2026-10-30 19:00 WIB = 12:00 UTC
    expect(businessDayEnd(new Date('2026-10-30T12:00:00Z')).toISOString()).toBe('2026-10-30T21:00:00.000Z');
  });

  it('ends at 04:00 WIB the same morning when unlocked after midnight', () => {
    // 2026-10-31 01:30 WIB = 2026-10-30 18:30 UTC
    expect(businessDayEnd(new Date('2026-10-30T18:30:00Z')).toISOString()).toBe('2026-10-30T21:00:00.000Z');
  });

  it('rolls to the next day when unlocked exactly at 04:00 WIB', () => {
    expect(businessDayEnd(new Date('2026-10-30T21:00:00Z')).toISOString()).toBe('2026-10-31T21:00:00.000Z');
  });
});

describe('device token', () => {
  const now = new Date('2026-10-30T12:00:00Z');
  const payload = { deviceId: 'dev-1', pinVersion: 3, exp: businessDayEnd(now).getTime() };

  it('round-trips a valid token', async () => {
    const token = await signDeviceToken(payload, SECRET);
    expect(await verifyDeviceToken(token, SECRET, now)).toEqual(payload);
  });

  it('rejects an expired token', async () => {
    const token = await signDeviceToken(payload, SECRET);
    expect(await verifyDeviceToken(token, SECRET, new Date(payload.exp))).toBeNull();
  });

  it('rejects a token signed with another secret', async () => {
    const token = await signDeviceToken(payload, 'another-secret-another-secret-xx');
    expect(await verifyDeviceToken(token, SECRET, now)).toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const token = await signDeviceToken(payload, SECRET);
    const [, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...payload, pinVersion: 4 })).toString('base64url');
    expect(await verifyDeviceToken(`${forged}.${sig}`, SECRET, now)).toBeNull();
  });

  it('rejects garbage', async () => {
    expect(await verifyDeviceToken('not-a-token', SECRET, now)).toBeNull();
    expect(await verifyDeviceToken('', SECRET, now)).toBeNull();
  });
});
