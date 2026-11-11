import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { processRedemptions } from './redeem';

const NOW = new Date('2026-11-11T05:00:00.000Z');
let orderId = '';

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "VoucherRedemption","Voucher","OrderItem","Order","Shift","Employee","Setting","Outlet" CASCADE');
  const outlet = (await prisma.outlet.create({ data: { name: 'Maraca', setting: { create: { cafe_name: 'Maraca', master_pin_hash: 'x' } } } })).id;
  const emp = (await prisma.employee.create({ data: { outlet_id: outlet, name: 'Rani' } })).id;
  const shift = (await prisma.shift.create({ data: { id: randomUUID(), outlet_id: outlet, device_id: 't', business_date: '2026-11-11', opening_float: 0, opened_by: emp, opened_at: NOW } })).id;
  orderId = (await prisma.order.create({ data: { id: randomUUID(), outlet_id: outlet, shift_id: shift, code: '261111-A7-001', number: 1, business_date: '2026-11-11', status: 'paid', order_type: 'takeaway', created_by: emp, created_at: NOW, voucher_code: 'MRC-AAAA-2222', voucher_discount: 20000 } })).id;
  vi.stubEnv('TOKOIBOEK_URL', 'http://tokoiboek.test');
  vi.stubEnv('VOUCHER_SYNC_TOKEN', 'x'.repeat(32));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const redemption = (state = 'pending') => prisma.voucherRedemption.create({ data: { id: randomUUID(), code: 'MRC-AAAA-2222', order_id: orderId, amount: 20000, at: NOW, state, next_attempt_at: NOW } });
const reply = (body: object, status = 200) => vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(body), { status }));

describe('processRedemptions', () => {
  it('reports a café redemption with the bill code as ref and marks it ok', async () => {
    const r = await redemption();
    const fetch = reply({ ok: true });
    vi.stubGlobal('fetch', fetch);
    expect(await processRedemptions({ now: NOW })).toEqual({ processed: 1 });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://tokoiboek.test/api/integrations/vouchers/redeem');
    expect(JSON.parse(String(init.body))).toEqual({ code: 'MRC-AAAA-2222', ref: '261111-A7-001', amount: 20000, at: NOW.toISOString() });
    expect(await prisma.voucherRedemption.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ state: 'ok', attempts: 1 });
    // done: not sent again
    expect(await processRedemptions({ now: NOW })).toEqual({ processed: 0 });
  });

  it('records a conflict with where the code was used, and puts the mirror right', async () => {
    // the till marked it used by this bill when it was paid
    await prisma.voucher.create({ data: { code: 'MRC-AAAA-2222', batch_name: 'L', kind: 'amount', value: 20000, expires_at: new Date('2099-01-01'), channels: 'both', status: 'USED', used_channel: 'cafe', used_ref: '261111-A7-001', used_at: NOW, updated_at: new Date('2026-11-10') } });
    const r = await redemption();
    vi.stubGlobal('fetch', reply({ ok: false, conflict: { channel: 'web', ref: 'TI-2611-0042', at: '2026-11-10T09:00:00.000Z' } }));
    await processRedemptions({ now: NOW });
    expect(await prisma.voucherRedemption.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({
      state: 'conflict', detail: { channel: 'web', ref: 'TI-2611-0042', at: '2026-11-10T09:00:00.000Z' },
    });
    expect(await prisma.voucher.findUnique({ where: { code: 'MRC-AAAA-2222' } })).toMatchObject({ status: 'USED', used_channel: 'web', used_ref: 'TI-2611-0042', used_at: new Date('2026-11-10T09:00:00.000Z') });
  });

  it('records a rejection with its reason', async () => {
    const r = await redemption();
    vi.stubGlobal('fetch', reply({ ok: false, reason: 'expired' }));
    await processRedemptions({ now: NOW });
    expect(await prisma.voucherRedemption.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ state: 'rejected', detail: { reason: 'expired' } });
  });

  it('keeps it pending with a growing wait when tokoiboek is unreachable', async () => {
    const r = await redemption();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await processRedemptions({ now: NOW });
    let row = await prisma.voucherRedemption.findUniqueOrThrow({ where: { id: r.id } });
    expect(row).toMatchObject({ state: 'pending', attempts: 1, last_error: 'fetch failed' });
    expect(row.next_attempt_at.getTime() - NOW.getTime()).toBe(60_000);
    expect(await processRedemptions({ now: NOW })).toEqual({ processed: 0 }); // not due yet
    vi.stubGlobal('fetch', reply({ error: 'x' }, 500));
    await processRedemptions({ now: row.next_attempt_at });
    row = await prisma.voucherRedemption.findUniqueOrThrow({ where: { id: r.id } });
    expect(row).toMatchObject({ state: 'pending', attempts: 2, last_error: 'HTTP 500' });
    expect(row.next_attempt_at.getTime() - NOW.getTime()).toBe(60_000 + 120_000);
  });

  it('stops at the first failure so a dead tokoiboek never holds up the request', async () => {
    const other = (await prisma.order.create({ data: { id: randomUUID(), outlet_id: (await prisma.outlet.findFirstOrThrow()).id, shift_id: (await prisma.shift.findFirstOrThrow()).id, code: '261111-A7-002', number: 2, business_date: '2026-11-11', status: 'paid', order_type: 'takeaway', created_by: 'e', created_at: NOW } })).id;
    await redemption();
    await prisma.voucherRedemption.create({ data: { id: randomUUID(), code: 'MRC-BBBB-3333', order_id: other, amount: 5000, at: NOW, next_attempt_at: NOW } });
    const fetch = vi.fn(async () => { throw new TypeError('fetch failed'); });
    vi.stubGlobal('fetch', fetch);
    await processRedemptions({ now: NOW });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await prisma.voucherRedemption.findMany({ where: { attempts: 0 } })).length).toBe(1); // the other waits for next time
  });

  it('releases the code of a refunded bill', async () => {
    const r = await redemption('releasing');
    const fetch = reply({ ok: true, released: true });
    vi.stubGlobal('fetch', fetch);
    await processRedemptions({ now: NOW });
    expect(fetch.mock.calls[0][0]).toBe('http://tokoiboek.test/api/integrations/vouchers/release');
    expect(JSON.parse(String(fetch.mock.calls[0][1].body))).toEqual({ code: 'MRC-AAAA-2222', ref: '261111-A7-001' });
    expect(await prisma.voucherRedemption.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ state: 'released' });
  });

  it('waits without the env', async () => {
    await redemption();
    vi.stubEnv('VOUCHER_SYNC_TOKEN', '');
    expect(await processRedemptions({ now: NOW })).toEqual({ processed: 0 });
  });
});
