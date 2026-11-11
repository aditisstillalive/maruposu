import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { applyMutations } from './apply';

const T0 = '2026-11-11T05:00:00.000Z';
const CODE = 'MRC-AAAA-2222';
let rani = '';
let shiftId = '';

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "VoucherRedemption","Voucher","PosMutation","RefundItem","Refund","CashMovement","OrderItemOption","OrderItem","Order","Shift","Promo","Employee","Setting","AuditLog","Outlet" CASCADE'
  );
  const outlet = (await prisma.outlet.create({ data: { name: 'Maraca', setting: { create: { cafe_name: 'Maraca', master_pin_hash: 'x' } } } })).id;
  rani = (await prisma.employee.create({ data: { outlet_id: outlet, name: 'Rani' } })).id;
  shiftId = randomUUID();
  await applyMutations('tablet', [{ id: randomUUID(), type: 'shift.open', created_at: T0, shift_id: shiftId, opening_float: 0, employee_id: rani, business_date: '2026-11-11' }]);
});

const voucher = (extra: object = {}) => prisma.voucher.create({
  data: { code: CODE, batch_name: 'Launch', kind: 'amount', value: 20000, min_spend: 0, expires_at: new Date('2099-01-01'), channels: 'both', status: 'ACTIVE', updated_at: new Date('2026-11-10'), ...extra },
});

/** A Rp 76.000 bill (2 lines) paid with the voucher, as the tablet sends it. */
async function payWithVoucher(discount = 20000) {
  const orderId = randomUUID();
  const items = [
    { id: randomUUID(), product_id: 'p1', category_id: 'c', name: 'Kopi', base_price: 28000, qty: 2, note: null, sort_order: 0, options: [] },
    { id: randomUUID(), product_id: 'p2', category_id: 'c', name: 'Croissant', base_price: 20000, qty: 1, note: null, sort_order: 1, options: [] },
  ];
  const total = 76000 - discount;
  const r = await applyMutations('tablet', [
    { id: randomUUID(), type: 'order.save', created_at: T0, order: { id: orderId, shift_id: shiftId, code: '261111-A7-001', number: 1, business_date: '2026-11-11', order_type: 'takeaway', customer_name: null, table_no: null, created_by: rani, created_at: T0, items } },
    { id: randomUUID(), type: 'order.pay', created_at: T0, order_id: orderId, promo_id: null, voucher_code: CODE, method: 'cash', cash_received: total, payment_ref: null, employee_id: rani,
      client_totals: { subtotal: 76000, discount, voucher_discount: discount, tax: Math.round(total / 11), total } },
  ]);
  return { orderId, items, results: r.results };
}

describe('paying with a voucher', () => {
  it('stores the voucher on the bill, marks the code used locally and queues the redemption', async () => {
    await voucher();
    const { orderId, results } = await payWithVoucher();
    expect(results.map(x => x.status)).toEqual(['applied', 'applied']);
    const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    expect(o).toMatchObject({ status: 'paid', voucher_code: CODE, voucher_discount: 20000, discount: 20000, total: 56000, sync_note: null });
    expect(o.items.reduce((s, i) => s + i.discount, 0)).toBe(20000);
    expect(await prisma.voucherRedemption.findFirst({ where: { order_id: orderId } })).toMatchObject({ code: CODE, amount: 20000, state: 'pending' });
    expect(await prisma.voucher.findUnique({ where: { code: CODE } })).toMatchObject({ status: 'USED', used_channel: 'cafe', used_ref: '261111-A7-001' });
  });

  it('keeps the sale when the mirror says the code was already used, with a note, and still reports it', async () => {
    await voucher({ status: 'USED', used_channel: 'web', used_ref: 'TI-2611-0042' });
    const { orderId, results } = await payWithVoucher();
    expect(results.map(x => x.status)).toEqual(['applied', 'applied']);
    const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(o).toMatchObject({ status: 'paid', voucher_code: CODE, voucher_discount: 20000, total: 56000 });
    expect(o.sync_note).toContain('Voucher sudah terpakai (web TI-2611-0042)');
    expect(await prisma.voucherRedemption.findFirst({ where: { order_id: orderId } })).toMatchObject({ state: 'pending' });
  });

  it('keeps the sale when the server has not heard of the code yet', async () => {
    const { orderId } = await payWithVoucher(15000);
    const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(o).toMatchObject({ voucher_discount: 15000, total: 61000 });
    expect(o.sync_note).toContain('Voucher belum ada di server');
    expect(o.sync_note).not.toContain('Hitungan tablet beda');
  });
});

describe('refunding a voucher bill', () => {
  const refund = (orderId: string, itemIds: string[]) => applyMutations('tablet', [{
    id: randomUUID(), type: 'order.refund', created_at: T0, refund_id: randomUUID(), order_id: orderId, method: 'cash', reason: 'Salah', employee_id: rani,
    items: itemIds.map(order_item_id => ({ order_item_id, qty: 1 })),
  }]);

  it('gives the code back only when the whole bill is refunded', async () => {
    await voucher();
    const { orderId, items } = await payWithVoucher();
    await prisma.voucherRedemption.updateMany({ data: { state: 'ok' } });
    await refund(orderId, [items[1].id]);
    expect((await prisma.voucherRedemption.findFirstOrThrow()).state).toBe('ok');
    await applyMutations('tablet', [{
      id: randomUUID(), type: 'order.refund', created_at: T0, refund_id: randomUUID(), order_id: orderId, method: 'cash', reason: 'Salah', employee_id: rani,
      items: [{ order_item_id: items[0].id, qty: 2 }],
    }]);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('refunded');
    expect((await prisma.voucherRedemption.findFirstOrThrow()).state).toBe('releasing');
  });

  it('a redemption never sent is simply dropped', async () => {
    await voucher();
    const { orderId, items } = await payWithVoucher();
    await applyMutations('tablet', [{
      id: randomUUID(), type: 'order.refund', created_at: T0, refund_id: randomUUID(), order_id: orderId, method: 'cash', reason: 'Salah', employee_id: rani,
      items: [{ order_item_id: items[0].id, qty: 2 }, { order_item_id: items[1].id, qty: 1 }],
    }]);
    expect((await prisma.voucherRedemption.findFirstOrThrow()).state).toBe('released');
  });
});
