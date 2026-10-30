import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getKV } from './db';
import { checkOfflinePin, offlineSessionValid, saveOfflineVerifier, startOfflineSession } from './offline-pin';

const NOW = new Date('2026-10-30T02:00:00Z');
const EXP = new Date('2026-10-30T21:00:00Z').getTime(); // 04:00 WIB

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('offline PIN', () => {
  it('accepts the PIN last used online and rejects others', async () => {
    await saveOfflineVerifier('192011', 3, NOW);
    expect(await checkOfflinePin('192011', NOW)).toBe(true);
    expect(await checkOfflinePin('192012', NOW)).toBe(false);
  });

  it("yesterday's online unlock still opens the tablet this morning without internet", async () => {
    await saveOfflineVerifier('192011', 3, new Date('2026-10-30T01:00:00Z')); // Thu 08:00 WIB
    expect(await checkOfflinePin('192011', new Date('2026-10-31T00:30:00Z'))).toBe(true); // Fri 07:30 WIB
  });

  it('stops working a week after the last online unlock', async () => {
    const saved = new Date('2026-10-30T01:00:00Z');
    await saveOfflineVerifier('192011', 3, saved);
    expect(await checkOfflinePin('192011', new Date(saved.getTime() + 7 * 24 * 3600 * 1000))).toBe(false);
  });

  it('never stores the PIN itself', async () => {
    await saveOfflineVerifier('192011', 3, NOW);
    expect(JSON.stringify(await getKV('offline_pin'))).not.toContain('192011');
  });

  it('without a verifier nothing unlocks', async () => {
    expect(await checkOfflinePin('192011', NOW)).toBe(false);
  });
});

describe('offline session', () => {
  it('lasts until the end of the business day', async () => {
    expect(await offlineSessionValid(NOW)).toBe(false);
    await startOfflineSession(NOW);
    expect(await offlineSessionValid(NOW)).toBe(true);
    expect(await offlineSessionValid(new Date(EXP))).toBe(false);
  });
});
