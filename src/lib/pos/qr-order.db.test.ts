import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { loadMenu } from './menu';
import { linesFromCart, QR_EXPIRE_MS, submitQrOrder, sweepQrOrders } from './qr-order';
import { applyMutations } from './apply';

const NOW = new Date('2026-11-01T07:00:00.000Z'); // 14.00 WIB
let outletId = '';
let shiftId = '';
let table = { id: '', name: '5' };
let kopiId = '';
let iceId = '';
let rani = '';

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "PosMutation","RefundItem","Refund","CashMovement","OrderItemOption","OrderItem","Order","DiningTable","Shift","Promo","ProductOptionGroup","Option","OptionGroup","Product","Category","Employee","Setting","AuditLog","Outlet" CASCADE'
  );
  outletId = (await prisma.outlet.create({ data: { name: 'Maraca', setting: { create: { cafe_name: 'Maraca', master_pin_hash: 'x' } } } })).id;
  rani = (await prisma.employee.create({ data: { outlet_id: outletId, name: 'Rani' } })).id;
  shiftId = (await prisma.shift.create({ data: { id: randomUUID(), outlet_id: outletId, business_date: '2026-11-01', opening_float: 0, opened_by: rani, opened_at: NOW, device_id: 'tablet' } })).id;
  table = { id: (await prisma.diningTable.create({ data: { outlet_id: outletId, name: '5', token: 'tok-5' } })).id, name: '5' };
  const cat = (await prisma.category.create({ data: { outlet_id: outletId, name: 'Kopi' } })).id;
  const suhu = await prisma.optionGroup.create({
    data: { outlet_id: outletId, name: 'Suhu', kind: 'variant', required: true, min_select: 1, max_select: 1, options: { create: [{ name: 'Ice', is_default: true }] } },
    include: { options: true },
  });
  iceId = suhu.options[0].id;
  kopiId = (await prisma.product.create({ data: { category_id: cat, name: 'Es Kopi Susu', price: 22000, option_groups: { create: [{ group_id: suhu.id }] } } })).id;
});

async function submit(qty: number, at = NOW, customerName: string | null = 'Ayu') {
  const { products } = await loadMenu(prisma, outletId);
  const lines = linesFromCart(products, [{ product_id: kopiId, option_ids: [iceId], qty }]);
  return prisma.$transaction(tx => submitQrOrder(tx, { outletId, shiftId, table, lines, customerName, now: at }));
}

describe('submitQrOrder', () => {
  it('opens a QR bill for the table, numbered from 501, priced from the database', async () => {
    const r = await submit(2);
    expect(r).toMatchObject({ number: 501, appended: false });
    const o = await prisma.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { items: { include: { options: true } } } });
    expect(o).toMatchObject({
      code: '261101-QR-001', status: 'open', source: 'qr', table_id: table.id, table_no: '5', created_by: 'qr', order_type: 'dine_in',
      customer_name: 'Ayu', shift_id: shiftId, business_date: '2026-11-01', claimed_at: null,
    });
    expect(o.items).toMatchObject([{ name: 'Es Kopi Susu', base_price: 22000, unit_price: 22000, qty: 2, origin: 'qr', options: [{ name: 'Ice' }] }]);
  });

  it('adds a second order from the same table to its open bill', async () => {
    const first = await submit(1);
    const again = await submit(3, new Date(NOW.getTime() + 60_000), 'Budi');
    expect(again).toMatchObject({ orderId: first.orderId, number: 501, appended: true });
    const o = await prisma.order.findUniqueOrThrow({ where: { id: first.orderId }, include: { items: { orderBy: { sort_order: 'asc' } } } });
    expect(o.items.map(i => [i.qty, i.sort_order])).toEqual([[1, 0], [3, 1]]);
    expect(o.customer_name).toBe('Ayu'); // the first name stays
    expect(o.qr_activity_at?.toISOString()).toBe(new Date(NOW.getTime() + 60_000).toISOString());
  });

  it('starts a new bill once the table\'s bill is paid, with the next number', async () => {
    const first = await submit(1);
    await prisma.order.update({ where: { id: first.orderId }, data: { status: 'paid' } });
    expect(await submit(1)).toMatchObject({ number: 502, appended: false });
  });
});

describe('sweepQrOrders', () => {
  it('voids QR bills unpaid and untouched 30 minutes after the last submit, nothing else', async () => {
    const stale = await submit(1);
    const claimed = await prisma.$transaction(async tx => {
      const t2 = await tx.diningTable.create({ data: { outlet_id: outletId, name: '6', token: 'tok-6' } });
      const { products } = await loadMenu(tx, outletId);
      return submitQrOrder(tx, { outletId, shiftId, table: { id: t2.id, name: '6' }, lines: linesFromCart(products, [{ product_id: kopiId, option_ids: [iceId], qty: 1 }]), customerName: null, now: NOW });
    });
    await prisma.order.update({ where: { id: claimed.orderId }, data: { claimed_at: NOW } });

    const early = await prisma.$transaction(tx => sweepQrOrders(tx, outletId, new Date(NOW.getTime() + QR_EXPIRE_MS - 1000)));
    expect(early.orderIds).toEqual([]);
    const late = await prisma.$transaction(tx => sweepQrOrders(tx, outletId, new Date(NOW.getTime() + QR_EXPIRE_MS + 1000)));
    expect(late.orderIds).toEqual([stale.orderId]);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: stale.orderId } })).toMatchObject({ status: 'void', voided_by: 'otomatis' });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: claimed.orderId } })).status).toBe('open');
  });
});

/** What the till sends when it saves the bill as it has it. */
async function tabletSave(orderId: string, keep: { id: string; qty: number }[], seen: string[]) {
  const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: { include: { options: true } } } });
  const items = keep.map((k, sort_order) => {
    const i = o.items.find(x => x.id === k.id)!;
    return {
      id: i.id, product_id: i.product_id ?? '', category_id: i.category_id ?? '', name: i.name, base_price: i.base_price, qty: k.qty, note: i.note, sort_order, origin: i.origin,
      options: i.options.map(x => ({ option_id: x.option_id ?? '', group_name: x.group_name, name: x.name, price_delta: x.price_delta })),
    };
  });
  return applyMutations('tablet', [{
    id: randomUUID(), type: 'order.save', created_at: NOW.toISOString(), order: {
      id: o.id, shift_id: o.shift_id, code: o.code, number: o.number, business_date: o.business_date, order_type: o.order_type,
      customer_name: o.customer_name, table_no: o.table_no, created_by: o.created_by, created_at: o.created_at.toISOString(), items, seen_item_ids: seen,
    },
  }]);
}

const itemIds = async (orderId: string) => (await prisma.orderItem.findMany({ where: { order_id: orderId }, orderBy: { sort_order: 'asc' } })).map(i => i.id);

describe('the till and QR bills', () => {
  it('saves a bill the customer created and claims it, keeping item origins', async () => {
    const { orderId } = await submit(1);
    const [a] = await itemIds(orderId);
    const r = await tabletSave(orderId, [{ id: a, qty: 1 }], [a]);
    expect(r.results[0]).toMatchObject({ status: 'applied' });
    const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    expect(o.claimed_at).not.toBeNull();
    expect(o.items.map(i => i.origin)).toEqual(['qr']);
  });

  it('keeps what the customer added after the till loaded the bill, and drops what the cashier removed', async () => {
    const { orderId } = await submit(1);
    const [a] = await itemIds(orderId);
    await submit(2, new Date(NOW.getTime() + 60_000)); // b: the till hasn't seen it
    const [, b] = await itemIds(orderId);
    await tabletSave(orderId, [{ id: a, qty: 4 }], [a]);
    const items = await prisma.orderItem.findMany({ where: { order_id: orderId } });
    expect(items.map(i => [i.id, i.qty]).sort()).toEqual([[a, 4], [b, 2]].sort());

    await tabletSave(orderId, [{ id: b, qty: 2 }], [a, b]); // the cashier removes a
    expect(await itemIds(orderId)).toEqual([b]);
  });

  it('moves items that arrived while paying to a new bill for the table', async () => {
    const { orderId } = await submit(1);
    const [a] = await itemIds(orderId);
    await submit(2, new Date(NOW.getTime() + 60_000));
    const [, b] = await itemIds(orderId);
    const r = await applyMutations('tablet', [{
      id: randomUUID(), type: 'order.pay', created_at: NOW.toISOString(), order_id: orderId, promo_id: null, method: 'cash', cash_received: 22000,
      payment_ref: null, employee_id: rani, client_totals: { subtotal: 22000, discount: 0, tax: 2000, total: 22000 }, item_ids: [a],
    }]);
    expect(r.results[0]).toMatchObject({ status: 'applied' });
    const paid = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    expect(paid).toMatchObject({ status: 'paid', total: 22000 });
    expect(paid.claimed_at).not.toBeNull();
    expect(paid.items.map(i => i.id)).toEqual([a]);
    const rest = await prisma.order.findFirstOrThrow({ where: { table_id: table.id, status: 'open' }, include: { items: true } });
    expect(rest).toMatchObject({ source: 'qr', number: 502, claimed_at: null });
    expect(rest.items.map(i => [i.id, i.qty])).toEqual([[b, 2]]);
  });
});
