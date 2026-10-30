import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queued: unknown[] = [];
vi.mock('@/lib/replica-sync', () => ({ queueSync: (...tasks: unknown[]) => queued.push(...tasks) }));

const { prisma } = await import('@/lib/prisma');
const { applyMutations } = await import('./apply');

const T0 = '2026-10-30T02:00:00.000Z';

beforeEach(async () => {
  queued.length = 0;
  await prisma.$executeRawUnsafe(
    'TRUNCATE "PosMutation","RefundItem","Refund","CashMovement","OrderItemOption","OrderItem","Order","Shift","Promo","ProductOptionGroup","Option","OptionGroup","Product","Category","Employee","Setting","AuditLog","Outlet" CASCADE'
  );
});

describe('replica sync after POS mutations', () => {
  it('queues the promo after a paid bill used it, so the replica sees the new used_count', async () => {
    const outlet = await prisma.outlet.create({ data: { name: 'M', setting: { create: { cafe_name: 'M', master_pin_hash: 'x' } } } });
    const rani = (await prisma.employee.create({ data: { outlet_id: outlet.id, name: 'Rani' } })).id;
    const cat = (await prisma.category.create({ data: { outlet_id: outlet.id, name: 'Makanan' } })).id;
    const product = (await prisma.product.create({ data: { category_id: cat, name: 'Croissant', price: 20000 } })).id;
    const promo = await prisma.promo.create({ data: { outlet_id: outlet.id, name: 'Kupon', code: 'X', kind: 'percent', value: 1000, scope: 'bill', quota: 5 } });
    const shiftId = randomUUID();
    const orderId = randomUUID();
    const r = await applyMutations('d', [
      { id: randomUUID(), type: 'shift.open', created_at: T0, shift_id: shiftId, opening_float: 0, employee_id: rani, business_date: '2026-10-30' },
      { id: randomUUID(), type: 'order.save', created_at: T0, order: {
        id: orderId, shift_id: shiftId, code: '261030-A7-001', number: 1, business_date: '2026-10-30', order_type: 'takeaway',
        customer_name: null, table_no: null, created_by: rani, created_at: T0,
        items: [{ id: randomUUID(), product_id: product, category_id: cat, name: 'Croissant', base_price: 20000, qty: 1, note: null, sort_order: 0, options: [] }],
      } },
      { id: randomUUID(), type: 'order.pay', created_at: T0, order_id: orderId, promo_id: promo.id, method: 'qris', cash_received: null, payment_ref: null,
        employee_id: rani, client_totals: { subtotal: 20000, discount: 2000, tax: 1636, total: 18000 } },
    ]);
    expect(r.results.map(x => x.status)).toEqual(['applied', 'applied', 'applied']);
    expect(queued).toContainEqual({ promo: promo.id });
    expect(queued).toContainEqual({ orders: [orderId] });
  });
});
