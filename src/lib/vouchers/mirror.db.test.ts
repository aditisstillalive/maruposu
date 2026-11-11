import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { cafeVouchers, pullVouchers, upsertVouchers, type WireVoucher } from './mirror';

const wire = (code: string, extra: Partial<WireVoucher> = {}): WireVoucher => ({
  code, batch_name: 'Launch', kind: 'amount', value: 20000, max_discount: null, min_spend: 0,
  expires_at: '2099-01-01T00:00:00.000Z', channels: 'both', status: 'ACTIVE', used_channel: null, used_ref: null, used_at: null,
  updated_at: '2026-11-11T01:00:00.000Z', ...extra,
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "VoucherRedemption","Voucher","VoucherSyncCursor" CASCADE');
  vi.stubEnv('TOKOIBOEK_URL', 'http://tokoiboek.test');
  vi.stubEnv('VOUCHER_SYNC_TOKEN', 'x'.repeat(32));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('upsertVouchers', () => {
  it('adds new codes and applies newer changes, never older ones', async () => {
    expect(await upsertVouchers([wire('MRC-AAAA-2222'), wire('MRC-BBBB-3333')])).toEqual(['MRC-AAAA-2222', 'MRC-BBBB-3333']);
    await upsertVouchers([wire('MRC-AAAA-2222', { status: 'USED', used_channel: 'web', used_ref: 'TI-1', used_at: '2026-11-11T02:00:00.000Z', updated_at: '2026-11-11T02:00:00.000Z' })]);
    // a late, older push must not bring it back
    expect(await upsertVouchers([wire('MRC-AAAA-2222', { updated_at: '2026-11-11T01:30:00.000Z' })])).toEqual([]);
    expect(await prisma.voucher.findUnique({ where: { code: 'MRC-AAAA-2222' } })).toMatchObject({ status: 'USED', used_channel: 'web', used_ref: 'TI-1' });
  });

  it('refuses malformed rows', async () => {
    await expect(upsertVouchers([{ ...wire('nope'), code: 'nope' }])).rejects.toThrow();
  });
});

describe('cafeVouchers (for the till)', () => {
  it('lists only active café codes that have not expired, rules shared by batch', async () => {
    await upsertVouchers([
      wire('MRC-AAAA-2222'), wire('MRC-BBBB-3333'),
      wire('MRC-CCCC-4444', { channels: 'web' }),
      wire('MRC-DDDD-5555', { status: 'USED' }),
      wire('MRC-EEEE-6666', { expires_at: '2020-01-01T00:00:00.000Z' }),
      wire('MRC-FFFF-7777', { batch_name: 'Ultah', kind: 'percent', value: 1000, max_discount: 25000, channels: 'cafe' }),
    ]);
    const v = await cafeVouchers(new Date('2026-11-11T05:00:00.000Z'));
    expect(Object.keys(v.codes).sort()).toEqual(['MRC-AAAA-2222', 'MRC-BBBB-3333', 'MRC-FFFF-7777']);
    expect(v.rules).toHaveLength(2);
    expect(v.rules[v.codes['MRC-FFFF-7777']]).toMatchObject({ batch_name: 'Ultah', kind: 'percent', value: 1000, max_discount: 25000 });
    expect(v.codes['MRC-AAAA-2222']).toBe(v.codes['MRC-BBBB-3333']);
  });
});

describe('pullVouchers', () => {
  it('follows the pages from the stored cursor and keeps the last one, at most once a minute', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push(String(url));
      expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${'x'.repeat(32)}`);
      const page = calls.length;
      return new Response(JSON.stringify(page === 1
        ? { vouchers: [wire('MRC-AAAA-2222')], more: true, next: { since: '2026-11-11T01:00:00.000Z', after_code: 'MRC-AAAA-2222' }, now: 'x' }
        : { vouchers: [wire('MRC-BBBB-3333')], more: false, next: { since: '2026-11-11T01:00:00.000Z', after_code: 'MRC-BBBB-3333' }, now: 'x' }));
    }));
    const now = new Date('2026-11-11T05:00:00.000Z');
    expect(await pullVouchers({ now })).toEqual({ pulled: 2, changed: 2 });
    expect(calls).toEqual([
      'http://tokoiboek.test/api/integrations/vouchers',
      'http://tokoiboek.test/api/integrations/vouchers?since=2026-11-11T01%3A00%3A00.000Z&after_code=MRC-AAAA-2222',
    ]);
    expect(await pullVouchers({ now: new Date(now.getTime() + 30_000) })).toBeNull(); // throttled
    await pullVouchers({ now: new Date(now.getTime() + 61_000) });
    expect(calls[2]).toBe('http://tokoiboek.test/api/integrations/vouchers?since=2026-11-11T01%3A00%3A00.000Z&after_code=MRC-BBBB-3333');
  });

  it('does nothing without the env', async () => {
    vi.stubEnv('TOKOIBOEK_URL', '');
    expect(await pullVouchers({ now: new Date() })).toBeNull();
  });
});
