import { describe, expect, it } from 'vitest';
import { syncStatus } from './sync-status';

const now = new Date('2026-10-31T08:00:00.000Z'); // 15.00 WIB
const base = { status: 'idle' as const, pending: 0, rejected: 0, last_synced_at: '2026-10-31T07:59:00.000Z' };

describe('syncStatus', () => {
  it('is calm when everything is sent', () => {
    expect(syncStatus(base, true, now)).toEqual({ tone: 'ok', icon: 'check', text: 'Tersinkron' });
  });

  it('shows what is waiting while it is being sent', () => {
    expect(syncStatus({ ...base, pending: 2 }, true, now)).toEqual({ tone: 'muted', icon: 'spin', text: '2 belum tersinkron' });
  });

  it('warns with the last sync time when sales have waited over 30 minutes', () => {
    const old = { ...base, status: 'offline' as const, pending: 3, last_synced_at: '2026-10-31T07:05:00.000Z' };
    expect(syncStatus(old, false, now)).toEqual({ tone: 'warn', icon: 'offline', text: 'Offline · 3 belum tersinkron · terakhir 14.05' });
    expect(syncStatus({ ...old, status: 'idle' }, true, now)).toEqual({ tone: 'warn', icon: 'alert', text: '3 belum tersinkron · terakhir 14.05' });
  });

  it('keeps the existing locked and error states', () => {
    expect(syncStatus({ ...base, status: 'locked' }, true, now).text).toBe('Perlu PIN untuk sinkron');
    expect(syncStatus({ ...base, status: 'error', pending: 1 }, true, now).text).toBe('Gagal sinkron · 1 belum tersinkron');
  });
});
