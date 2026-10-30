import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { applyMutations } from './apply';

const DEVICE = 'device-test';
const T0 = '2026-10-30T02:00:00.000Z'; // 09:00 WIB

let outletId = '';
let rani = '';
let kopiId = '';
let croissantId = '';
let kopiCat = '';
let makananCat = '';

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "PosMutation","RefundItem","Refund","CashMovement","OrderItemOption","OrderItem","Order","Shift","Promo","ProductOptionGroup","Option","OptionGroup","Product","Category","Employee","Setting","AuditLog","Outlet" CASCADE'
  );
  const outlet = await prisma.outlet.create({
    data: { name: 'Maraca', setting: { create: { cafe_name: 'Maraca', master_pin_hash: 'x' } } },
  });
  outletId = outlet.id;
  rani = (await prisma.employee.create({ data: { outlet_id: outletId, name: 'Rani' } })).id;
  kopiCat = (await prisma.category.create({ data: { outlet_id: outletId, name: 'Kopi' } })).id;
  makananCat = (await prisma.category.create({ data: { outlet_id: outletId, name: 'Makanan' } })).id;
  kopiId = (await prisma.product.create({ data: { category_id: kopiCat, name: 'Es Kopi Susu', price: 22000 } })).id;
  croissantId = (await prisma.product.create({ data: { category_id: makananCat, name: 'Croissant', price: 20000 } })).id;
});

const m = (type: string, payload: Record<string, unknown>, id = randomUUID()) => ({ id, type, created_at: T0, ...payload });

function openShift(shiftId = randomUUID()) {
  return m('shift.open', { shift_id: shiftId, opening_float: 200000, employee_id: rani, business_date: '2026-10-30' });
}

function saveOrder(shiftId: string, orderId = randomUUID(), code = '261030-A7-001') {
  return m('order.save', {
    order: {
      id: orderId, shift_id: shiftId, code, number: 1, business_date: '2026-10-30', order_type: 'dine_in',
      customer_name: 'Budi', table_no: '5', created_by: rani, created_at: T0,
      items: [
        { id: randomUUID(), product_id: kopiId, category_id: kopiCat, name: 'Es Kopi Susu', base_price: 22000, qty: 2, note: 'less ice', sort_order: 0,
          options: [{ option_id: 'o1', group_name: 'Extra', name: 'Extra shot', price_delta: 6000 }] },
        { id: randomUUID(), product_id: croissantId, category_id: makananCat, name: 'Croissant', base_price: 20000, qty: 1, note: null, sort_order: 1, options: [] },
      ],
    },
  });
}

function pay(orderId: string, extra: Record<string, unknown> = {}) {
  return m('order.pay', {
    order_id: orderId, promo_id: null, method: 'cash', cash_received: 100000, payment_ref: null, employee_id: rani,
    client_totals: { subtotal: 76000, discount: 0, tax: 6909, total: 76000 }, ...extra,
  });
}

async function flow() {
  const shiftId = randomUUID();
  const orderId = randomUUID();
  const r = await applyMutations(DEVICE, [openShift(shiftId), saveOrder(shiftId, orderId), pay(orderId)]);
  expect(r.results.map(x => x.status)).toEqual(['applied', 'applied', 'applied']);
  return { shiftId, orderId };
}

describe('applyMutations', () => {
  it('applies a full open-bill flow', async () => {
    const { orderId } = await flow();
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: { include: { options: true } } } });
    expect(order).toMatchObject({ status: 'paid', total: 76000, tax: 6909, cash_received: 100000, change: 24000, paid_by: rani, sync_note: null });
    expect(order.items.map(i => i.unit_price).sort()).toEqual([20000, 28000]);
    expect(order.items.reduce((s, i) => s + i.paid, 0)).toBe(76000);
    expect(order.items.find(i => i.name === 'Es Kopi Susu')?.options[0]).toMatchObject({ name: 'Extra shot', price_delta: 6000 });
  });

  it('same mutation twice is a duplicate with no second effect', async () => {
    const { shiftId } = await flow();
    const move = m('cash.move', { movement_id: randomUUID(), shift_id: shiftId, kind: 'paid_out', amount: 20000, note: 'Beli galon', employee_id: rani });
    const r1 = await applyMutations(DEVICE, [move]);
    const r2 = await applyMutations(DEVICE, [move]);
    expect(r1.results[0].status).toBe('applied');
    expect(r2.results[0].status).toBe('duplicate');
    expect(await prisma.cashMovement.count()).toBe(1);
  });

  it("pay keeps the tablet's totals when the promo changed offline", async () => {
    const shiftId = randomUUID();
    const orderId = randomUUID();
    const promo = await prisma.promo.create({ data: { outlet_id: outletId, name: 'Diskon 10%', kind: 'percent', value: 1000, scope: 'bill', is_active: false } });
    const r = await applyMutations(DEVICE, [
      openShift(shiftId),
      saveOrder(shiftId, orderId),
      pay(orderId, { promo_id: promo.id, client_totals: { subtotal: 76000, discount: 7600, tax: 6218, total: 68400 } }),
    ]);
    expect(r.results[2].status).toBe('applied');
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    expect(order).toMatchObject({ total: 68400, discount: 7600, change: 31600, promo_name: 'Diskon 10%' });
    expect(order.sync_note).toBeTruthy();
    expect(order.items.reduce((s, i) => s + i.paid, 0)).toBe(68400);
  });

  it('counts promo use and notes an exceeded quota without rejecting', async () => {
    const promo = await prisma.promo.create({ data: { outlet_id: outletId, name: 'Kupon', code: 'MARACA10', kind: 'percent', value: 1000, scope: 'bill', quota: 1, used_count: 1 } });
    const shiftId = randomUUID();
    const orderId = randomUUID();
    const r = await applyMutations(DEVICE, [
      openShift(shiftId), saveOrder(shiftId, orderId),
      pay(orderId, { promo_id: promo.id, client_totals: { subtotal: 76000, discount: 7600, tax: 6218, total: 68400 } }),
    ]);
    expect(r.results[2].status).toBe('applied');
    expect((await prisma.promo.findUniqueOrThrow({ where: { id: promo.id } })).used_count).toBe(2);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).sync_note).toMatch(/kuota/i);
  });

  it('rejects cash below total', async () => {
    const shiftId = randomUUID();
    const orderId = randomUUID();
    const r = await applyMutations(DEVICE, [openShift(shiftId), saveOrder(shiftId, orderId), pay(orderId, { cash_received: 50000 })]);
    expect(r.results[2]).toMatchObject({ status: 'rejected', error: 'Uang diterima kurang dari total' });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('open');
    expect((await prisma.posMutation.findUniqueOrThrow({ where: { id: r.results[2].id } })).status).toBe('rejected');
  });

  it('refunds per item and moves drawer cash', async () => {
    const { orderId } = await flow();
    const kopi = await prisma.orderItem.findFirstOrThrow({ where: { order_id: orderId, name: 'Es Kopi Susu' } });
    const croissant = await prisma.orderItem.findFirstOrThrow({ where: { order_id: orderId, name: 'Croissant' } });
    const refundId = randomUUID();
    const r = await applyMutations(DEVICE, [
      m('order.refund', { refund_id: refundId, order_id: orderId, method: 'cash', reason: 'Salah buat', employee_id: rani, items: [{ order_item_id: kopi.id, qty: 1 }] }),
    ]);
    expect(r.results[0].status).toBe('applied');
    const refund = await prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
    expect(refund.amount).toBe(Math.round(kopi.paid / 2));
    expect(refund.tax).toBe(Math.round((refund.amount * 1000) / 11000));
    const move = await prisma.cashMovement.findFirstOrThrow({ where: { refund_id: refundId } });
    expect(move).toMatchObject({ kind: 'refund_out', amount: refund.amount });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('paid');

    const r2 = await applyMutations(DEVICE, [
      m('order.refund', { refund_id: randomUUID(), order_id: orderId, method: 'cashless', reason: 'Komplain', employee_id: rani,
        items: [{ order_item_id: kopi.id, qty: 1 }, { order_item_id: croissant.id, qty: 1 }] }),
    ]);
    expect(r2.results[0].status).toBe('applied');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('refunded');
    const refunded = await prisma.refund.aggregate({ where: { order_id: orderId }, _sum: { amount: true } });
    expect(refunded._sum.amount).toBe(76000);
    expect(await prisma.cashMovement.count({ where: { kind: 'refund_out' } })).toBe(1);
  });

  it('rejects refunding more than is left', async () => {
    const { orderId } = await flow();
    const croissant = await prisma.orderItem.findFirstOrThrow({ where: { order_id: orderId, name: 'Croissant' } });
    const r = await applyMutations(DEVICE, [
      m('order.refund', { refund_id: randomUUID(), order_id: orderId, method: 'cash', reason: 'x', employee_id: rani, items: [{ order_item_id: croissant.id, qty: 2 }] }),
    ]);
    expect(r.results[0].status).toBe('rejected');
  });

  it('void only open bills', async () => {
    const { orderId } = await flow();
    const r = await applyMutations(DEVICE, [m('order.void', { order_id: orderId, reason: 'Batal', employee_id: rani })]);
    expect(r.results[0].status).toBe('rejected');

    const shift = await prisma.shift.findFirstOrThrow();
    const openId = randomUUID();
    const r2 = await applyMutations(DEVICE, [saveOrder(shift.id, openId, '261030-A7-002'), m('order.void', { order_id: openId, reason: 'Customer batal', employee_id: rani })]);
    expect(r2.results.map(x => x.status)).toEqual(['applied', 'applied']);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: openId } })).toMatchObject({ status: 'void', void_reason: 'Customer batal', voided_by: rani });
    expect(await prisma.auditLog.count({ where: { action: 'order.void' } })).toBe(1);
  });

  it('a paid order cannot be edited', async () => {
    const { shiftId, orderId } = await flow();
    const r = await applyMutations(DEVICE, [saveOrder(shiftId, orderId)]);
    expect(r.results[0].status).toBe('rejected');
  });

  it('second open shift is rejected', async () => {
    await applyMutations(DEVICE, [openShift()]);
    const r = await applyMutations(DEVICE, [openShift()]);
    expect(r.results[0].status).toBe('rejected');
  });

  it('rejects malformed mutations and unknown employees', async () => {
    const r = await applyMutations(DEVICE, [{ id: randomUUID(), type: 'order.teleport', created_at: T0 }, m('shift.open', { shift_id: randomUUID(), opening_float: 1, employee_id: 'nobody', business_date: '2026-10-30' })]);
    expect(r.results.map(x => x.status)).toEqual(['rejected', 'rejected']);
  });
});
