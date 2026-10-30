import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { applyMutations, closeShiftTx } from './apply';

const DEVICE = 'device-test';
const T0 = '2026-10-30T02:00:00.000Z';
let outletId = '';
let rani = '';
let cat = '';
let croissant = '';

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "PosMutation","RefundItem","Refund","CashMovement","OrderItemOption","OrderItem","Order","Shift","Promo","ProductOptionGroup","Option","OptionGroup","Product","Category","Employee","Setting","AuditLog","Outlet" CASCADE'
  );
  const outlet = await prisma.outlet.create({ data: { name: 'M', setting: { create: { cafe_name: 'M', master_pin_hash: 'x' } } } });
  outletId = outlet.id;
  rani = (await prisma.employee.create({ data: { outlet_id: outletId, name: 'Rani' } })).id;
  cat = (await prisma.category.create({ data: { outlet_id: outletId, name: 'Makanan' } })).id;
  croissant = (await prisma.product.create({ data: { category_id: cat, name: 'Croissant', price: 20000 } })).id;
});

const m = (type: string, payload: Record<string, unknown>) => ({ id: randomUUID(), type, created_at: T0, ...payload });
const notes = (n: Record<string, number>, coins = 0) => ({ notes: n, coins });

let seq = 0;
function sale(shiftId: string, method: 'cash' | 'qris' = 'cash', pay = true) {
  const orderId = randomUUID();
  seq += 1;
  const out = [
    m('order.save', { order: {
      id: orderId, shift_id: shiftId, code: `261030-A7-${String(seq).padStart(3, '0')}`, number: seq, business_date: '2026-10-30',
      order_type: 'takeaway', customer_name: null, table_no: null, created_by: rani, created_at: T0,
      items: [{ id: randomUUID(), product_id: croissant, category_id: cat, name: 'Croissant', base_price: 20000, qty: 1, note: null, sort_order: 0, options: [] }],
    } }),
  ];
  if (pay) out.push(m('order.pay', { order_id: orderId, promo_id: null, method, cash_received: method === 'cash' ? 20000 : null, payment_ref: null, employee_id: rani,
    client_totals: { subtotal: 20000, discount: 0, tax: 1818, total: 20000 } }));
  return { orderId, mutations: out };
}

/** Shift with float 200 000, one cash sale 20 000, one QRIS sale, paid out 5 000 → expected 215 000. */
async function busyShift() {
  const shiftId = randomUUID();
  const r = await applyMutations(DEVICE, [
    m('shift.open', { shift_id: shiftId, opening_float: 200000, employee_id: rani, business_date: '2026-10-30' }),
    ...sale(shiftId, 'cash').mutations,
    ...sale(shiftId, 'qris').mutations,
    m('cash.move', { movement_id: randomUUID(), shift_id: shiftId, kind: 'paid_out', amount: 5000, note: 'Es batu', employee_id: rani }),
  ]);
  expect(r.results.every(x => x.status === 'applied')).toBe(true);
  return shiftId;
}

const close = (shiftId: string, d: { notes: Record<string, number>; coins: number }, counted: number, note: string | null = null, client_expected = 215000) =>
  m('shift.close', { shift_id: shiftId, denominations: d, counted_cash: counted, note, employee_id: rani, client_expected });

describe('shift.close', () => {
  it("closes a shift with the server's expected cash", async () => {
    const shiftId = await busyShift();
    const r = await applyMutations(DEVICE, [close(shiftId, notes({ '100000': 2, '10000': 1, '5000': 1 }), 215000)]);
    expect(r.results[0].status).toBe('applied');
    const s = await prisma.shift.findUniqueOrThrow({ where: { id: shiftId } });
    expect(s).toMatchObject({ status: 'closed', closed_by: rani, closed_via: 'tablet', counted_cash: 215000, expected_cash: 215000, variance: 0, sync_note: null });
    expect(s.summary).toMatchObject({ cash_sales: 20000, qris_sales: 20000, paid_out: 5000, transactions: 2 });
    expect(await prisma.auditLog.count({ where: { action: 'shift.close' } })).toBe(1);
  });

  it('requires a note when the count is off', async () => {
    const shiftId = await busyShift();
    const d = notes({ '100000': 2, '10000': 1 }, 4000);
    const r = await applyMutations(DEVICE, [close(shiftId, d, 214000)]);
    expect(r.results[0]).toMatchObject({ status: 'rejected', error: 'Catatan wajib karena ada selisih' });
    const r2 = await applyMutations(DEVICE, [close(shiftId, d, 214000, 'Kembalian salah')]);
    expect(r2.results[0].status).toBe('applied');
    expect(await prisma.shift.findUniqueOrThrow({ where: { id: shiftId } })).toMatchObject({ variance: -1000, close_note: 'Kembalian salah' });
  });

  it('blocks closing while a bill is open', async () => {
    const shiftId = await busyShift();
    await applyMutations(DEVICE, sale(shiftId, 'cash', false).mutations);
    const r = await applyMutations(DEVICE, [close(shiftId, notes({ '100000': 2, '10000': 1, '5000': 1 }), 215000)]);
    expect(r.results[0]).toMatchObject({ status: 'rejected', error: 'Masih ada 1 open bill' });
  });

  it("keeps the server's figure when the tablet's expected differs", async () => {
    const shiftId = await busyShift();
    const r = await applyMutations(DEVICE, [close(shiftId, notes({ '100000': 3 }), 300000, 'Hitung', 300000)]);
    expect(r.results[0].status).toBe('applied');
    const s = await prisma.shift.findUniqueOrThrow({ where: { id: shiftId } });
    expect(s).toMatchObject({ expected_cash: 215000, client_expected: 300000, variance: 85000 });
    expect(s.sync_note).toBeTruthy();
  });

  it("rejects a count that doesn't add up", async () => {
    const shiftId = await busyShift();
    const r = await applyMutations(DEVICE, [close(shiftId, notes({ '100000': 2 }), 215000)]);
    expect(r.results[0].status).toBe('rejected');
  });

  it('mutations for a closed shift are rejected', async () => {
    const shiftId = await busyShift();
    await applyMutations(DEVICE, [close(shiftId, notes({ '100000': 2, '10000': 1, '5000': 1 }), 215000)]);
    const r = await applyMutations(DEVICE, [m('cash.move', { movement_id: randomUUID(), shift_id: shiftId, kind: 'paid_in', amount: 1000, note: 'x', employee_id: rani })]);
    expect(r.results[0]).toMatchObject({ status: 'rejected', error: 'Shift sudah ditutup' });
  });

  it('a new shift can open after closing', async () => {
    const shiftId = await busyShift();
    await applyMutations(DEVICE, [close(shiftId, notes({ '100000': 2, '10000': 1, '5000': 1 }), 215000)]);
    const r = await applyMutations(DEVICE, [m('shift.open', { shift_id: randomUUID(), opening_float: 100000, employee_id: rani, business_date: '2026-10-30' })]);
    expect(r.results[0].status).toBe('applied');
  });
});

describe('closeShiftTx (admin)', () => {
  it('admin close voids leftover open bills', async () => {
    const shiftId = await busyShift();
    const open = sale(shiftId, 'cash', false);
    await applyMutations(DEVICE, open.mutations);
    const orderId = open.orderId;
    const result = await prisma.$transaction(tx =>
      closeShiftTx(tx, { outletId, tax: { name: 'PB1', rate_bp: 1000, inclusive: true } }, {
        shiftId, denominations: notes({ '100000': 2, '10000': 1, '5000': 1 }), note: 'Tablet rusak', closedBy: 'admin@maraca.id', via: 'admin', at: new Date(), voidOpenWithReason: 'Tablet rusak',
      })
    );
    expect(result).toMatchObject({ expected: 215000, variance: 0 });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({ status: 'void', void_reason: 'Ditutup admin: Tablet rusak' });
    expect(await prisma.shift.findUniqueOrThrow({ where: { id: shiftId } })).toMatchObject({ status: 'closed', closed_via: 'admin', closed_by: 'admin@maraca.id' });
  });
});
