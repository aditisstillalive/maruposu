import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { applyMutations } from './apply';
import { buildSnapshot } from './snapshot';

const T0 = '2026-10-30T02:00:00.000Z';
let outletId = '';
let rani = '';
let kopiCat = '';
let kopiId = '';

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "PosMutation","RefundItem","Refund","CashMovement","OrderItemOption","OrderItem","Order","Shift","Promo","ProductOptionGroup","Option","OptionGroup","Product","Category","Employee","Setting","AuditLog","Outlet" CASCADE'
  );
  const outlet = await prisma.outlet.create({
    data: { name: 'Maraca', address: 'Jl. Jalak Harupat 9A', setting: { create: { cafe_name: 'Maraca Books & Coffee', master_pin_hash: 'x', receipt_footer: 'Terima kasih' } } },
  });
  outletId = outlet.id;
  rani = (await prisma.employee.create({ data: { outlet_id: outletId, name: 'Rani' } })).id;
  await prisma.employee.create({ data: { outlet_id: outletId, name: 'Mantan', is_active: false } });
  kopiCat = (await prisma.category.create({ data: { outlet_id: outletId, name: 'Kopi' } })).id;
  await prisma.category.create({ data: { outlet_id: outletId, name: 'Tersembunyi', is_active: false } });
  const suhu = await prisma.optionGroup.create({
    data: {
      outlet_id: outletId, name: 'Suhu', kind: 'variant', required: true, min_select: 1, max_select: 1,
      options: { create: [{ name: 'Ice', is_default: true, sort_order: 0 }, { name: 'Hot', sort_order: 1 }, { name: 'Lama', is_active: false, sort_order: 2 }] },
    },
  });
  kopiId = (await prisma.product.create({ data: { category_id: kopiCat, name: 'Es Kopi Susu', price: 22000, option_groups: { create: [{ group_id: suhu.id }] } } })).id;
  await prisma.product.create({ data: { category_id: kopiCat, name: 'Nonaktif', price: 1, is_active: false } });
  await prisma.promo.create({ data: { outlet_id: outletId, name: 'Aktif', kind: 'percent', value: 1000, scope: 'bill' } });
  await prisma.promo.create({ data: { outlet_id: outletId, name: 'Berakhir', kind: 'percent', value: 1000, scope: 'bill', ends_at: new Date('2020-01-01') } });
  await prisma.promo.create({ data: { outlet_id: outletId, name: 'Mati', kind: 'percent', value: 1000, scope: 'bill', is_active: false } });
});

describe('buildSnapshot', () => {
  it('serves the active menu, staff and promos', async () => {
    const s = await buildSnapshot('device-abc');
    expect(s.device_tag).toMatch(/^[0-9A-F]{2}$/);
    expect(s.setting).toEqual({
      cafe_name: 'Maraca Books & Coffee', address: 'Jl. Jalak Harupat 9A', receipt_footer: 'Terima kasih',
      tax: { name: 'PB1', rate_bp: 1000, inclusive: true },
    });
    expect(s.employees.map(e => e.name)).toEqual(['Rani']);
    expect(s.categories.map(c => c.name)).toEqual(['Kopi']);
    expect(s.products.map(p => p.name)).toEqual(['Es Kopi Susu']);
    expect(s.products[0].groups[0]).toMatchObject({ name: 'Suhu', kind: 'variant', required: true });
    expect(s.products[0].groups[0].options.map(o => [o.name, o.is_default])).toEqual([['Ice', true], ['Hot', false]]);
    expect(s.promos.map(p => p.name)).toEqual(['Aktif']);
    expect(s.shift).toBeNull();
    expect(s.orders).toEqual([]);
  });

  it('uses the same device tag for the same device', async () => {
    expect((await buildSnapshot('device-abc')).device_tag).toBe((await buildSnapshot('device-abc')).device_tag);
  });

  it("includes the open shift with its orders and cash moves", async () => {
    const shiftId = randomUUID();
    const orderId = randomUUID();
    const itemId = randomUUID();
    await applyMutations('device-abc', [
      { id: randomUUID(), type: 'shift.open', created_at: T0, shift_id: shiftId, opening_float: 200000, employee_id: rani, business_date: '2026-10-30' },
      { id: randomUUID(), type: 'order.save', created_at: T0, order: {
        id: orderId, shift_id: shiftId, code: '261030-A7-001', number: 1, business_date: '2026-10-30', order_type: 'takeaway',
        customer_name: 'Budi', table_no: null, created_by: rani, created_at: T0,
        items: [{ id: itemId, product_id: kopiId, category_id: kopiCat, name: 'Es Kopi Susu', base_price: 22000, qty: 1, note: null, sort_order: 0,
          options: [{ option_id: 'o', group_name: 'Suhu', name: 'Ice', price_delta: 0 }] }],
      } },
      { id: randomUUID(), type: 'cash.move', created_at: T0, movement_id: randomUUID(), shift_id: shiftId, kind: 'paid_in', amount: 50000, note: 'Modal Bu Risya', employee_id: rani },
    ]);
    const s = await buildSnapshot('device-abc');
    expect(s.shift).toMatchObject({ id: shiftId, opening_float: 200000, opened_by: rani, status: 'open', opened_at: T0 });
    expect(s.orders).toHaveLength(1);
    expect(s.orders[0]).toMatchObject({ id: orderId, status: 'open', order_type: 'takeaway', customer_name: 'Budi', created_at: T0, refunds: [] });
    expect(s.orders[0].items[0]).toMatchObject({ id: itemId, base_price: 22000, qty: 1, options: [{ group_name: 'Suhu', name: 'Ice', price_delta: 0 }] });
    expect(s.cash_moves).toMatchObject([{ kind: 'paid_in', amount: 50000, note: 'Modal Bu Risya' }]);
  });
});
