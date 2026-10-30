import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { loadReportData } from './load';

let outletId = '';
let rani = '';
let shiftId = '';
let catId = '';

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "RefundItem","Refund","CashMovement","OrderItemOption","OrderItem","Order","Shift","Product","Category","Employee","Setting","Outlet" CASCADE'
  );
  outletId = (await prisma.outlet.create({ data: { name: 'M' } })).id;
  rani = (await prisma.employee.create({ data: { outlet_id: outletId, name: 'Rani' } })).id;
  catId = (await prisma.category.create({ data: { outlet_id: outletId, name: 'Kopi' } })).id;
  shiftId = (await prisma.shift.create({ data: { id: randomUUID(), outlet_id: outletId, device_id: 'd', business_date: '2026-10-30', opening_float: 0, opened_by: rani, opened_at: new Date() } })).id;
});

async function order(code: string, business_date: string, status: string, extra: Record<string, unknown> = {}) {
  const id = randomUUID();
  await prisma.order.create({
    data: {
      id, outlet_id: outletId, shift_id: shiftId, code, number: 1, business_date, status, order_type: 'takeaway', created_by: rani,
      paid_by: status === 'open' ? null : rani, total: 20000, subtotal: 20000, tax: 1818, payment_method: status === 'open' ? null : 'cash',
      paid_at: status === 'open' ? null : new Date('2026-10-30T03:00:00Z'), created_at: new Date('2026-10-30T02:00:00Z'), ...extra,
      items: { create: [{ id: randomUUID(), product_id: 'p1', category_id: catId, name: 'Kopi', base_price: 20000, unit_price: 20000, qty: 1, paid: 20000, cogs: 5000,
        options: { create: [{ group_name: 'Suhu', name: 'Ice', price_delta: 0 }] } }] },
    },
  });
  return id;
}

describe('loadReportData', () => {
  it('takes the period\'s sold and voided bills, not open ones, with names', async () => {
    await order('A', '2026-10-30', 'paid');
    await order('B', '2026-10-30', 'void');
    await order('C', '2026-10-30', 'open');
    await order('D', '2026-10-29', 'paid');
    const d = await loadReportData(outletId, { from: '2026-10-30', to: '2026-10-30' });
    expect(d.orders.map(o => o.code).sort()).toEqual(['A', 'B']);
    expect(d.orders[0].items[0]).toMatchObject({ category_name: 'Kopi', options: ['Ice'], cogs: 5000 });
    expect(d.employees[rani]).toBe('Rani');
  });

  it('takes refunds by the business day they were made', async () => {
    const id = await order('A', '2026-10-30', 'refunded');
    // 31 Oct 10:00 WIB
    await prisma.refund.create({ data: { id: randomUUID(), order_id: id, shift_id: shiftId, method: 'cash', amount: 20000, tax: 1818, reason: 'x', employee_id: rani, created_at: new Date('2026-10-31T03:00:00Z') } });
    expect((await loadReportData(outletId, { from: '2026-10-30', to: '2026-10-30' })).refunds).toHaveLength(0);
    const d = await loadReportData(outletId, { from: '2026-10-31', to: '2026-10-31' });
    expect(d.refunds).toMatchObject([{ business_date: '2026-10-31', order_code: 'A', amount: 20000 }]);
  });
});
