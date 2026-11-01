import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { readDb } from '@/lib/db-router';
import { getCurrentOutlet } from '@/lib/outlet';
import { toPromoRule } from './promo-map';
import { businessDateWIB } from './codes';
import { isLow } from './inventory';
import { loadMenu } from './menu';
import { sweepQrOrders } from './qr-order';
import { queueSync } from '@/lib/replica-sync';
import type { CashMoveDoc, OrderDoc, ReceiptLogo, Snapshot } from './types';

export const orderInclude = {
  items: { include: { options: true, refund_items: true }, orderBy: { sort_order: 'asc' } },
  refunds: { include: { items: true }, orderBy: { created_at: 'asc' } },
} satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export function toOrderDoc(o: OrderRow): OrderDoc {
  return {
    id: o.id, shift_id: o.shift_id, code: o.code, number: o.number, business_date: o.business_date,
    status: o.status as OrderDoc['status'], order_type: o.order_type as OrderDoc['order_type'],
    customer_name: o.customer_name, table_no: o.table_no, created_by: o.created_by, paid_by: o.paid_by,
    subtotal: o.subtotal, discount: o.discount, tax: o.tax, total: o.total, promo_id: o.promo_id, promo_name: o.promo_name,
    payment_method: o.payment_method as OrderDoc['payment_method'], cash_received: o.cash_received, change: o.change,
    payment_ref: o.payment_ref, paid_at: o.paid_at?.toISOString() ?? null, void_reason: o.void_reason,
    created_at: o.created_at.toISOString(),
    source: o.source as 'pos' | 'qr', table_id: o.table_id, qr_activity_at: o.qr_activity_at?.toISOString() ?? null, claimed_at: o.claimed_at?.toISOString() ?? null,
    items: o.items.map(i => ({
      id: i.id, product_id: i.product_id ?? '', category_id: i.category_id ?? '', name: i.name, base_price: i.base_price,
      options: i.options.map(opt => ({ option_id: opt.option_id ?? '', group_name: opt.group_name, name: opt.name, price_delta: opt.price_delta })),
      qty: i.qty, note: i.note, sort_order: i.sort_order, discount: i.discount, paid: i.paid,
      refunded_qty: i.refunded_qty, refunded_amount: i.refunded_amount, origin: i.origin as 'pos' | 'qr',
    })),
    refunds: o.refunds.map(r => ({
      id: r.id, shift_id: r.shift_id, method: r.method as 'cash' | 'cashless', amount: r.amount, tax: r.tax, reason: r.reason,
      employee_id: r.employee_id, created_at: r.created_at.toISOString(),
      items: r.items.map(x => ({ order_item_id: x.order_item_id, qty: x.qty, amount: x.amount })),
    })),
  };
}

/** Short, stable tag for order codes; the device id cookie itself is httpOnly. */
export function deviceTag(deviceId: string): string {
  return createHash('sha256').update(deviceId).digest('hex').slice(0, 2).toUpperCase();
}

/**
 * Everything the tablet needs to work offline. Menu, staff and promos may come
 * from the replica; the shift and its orders always come from the primary.
 */
export async function buildSnapshot(deviceId: string, current?: Awaited<ReturnType<typeof getCurrentOutlet>>): Promise<Snapshot> {
  const outlet = current ?? (await getCurrentOutlet());
  const now = new Date();

  const [employees, menu, promos] = await readDb(db =>
    Promise.all([
      db.employee.findMany({
        where: { outlet_id: outlet.id, is_active: true },
        orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, photo_url: true },
      }),
      loadMenu(db, outlet.id),
      db.promo.findMany({
        where: { outlet_id: outlet.id, is_active: true, OR: [{ ends_at: null }, { ends_at: { gt: now } }] },
        orderBy: { created_at: 'asc' },
      }),
    ])
  );
  const { categories, products } = menu;

  // QR bills nobody paid within 30 minutes are cancelled before the till sees them
  const swept = await prisma.$transaction(tx => sweepQrOrders(tx, outlet.id, now));
  if (swept.orderIds.length) queueSync({ orders: swept.orderIds }, ...swept.auditIds.map(auditLog => ({ auditLog })));

  const shift = await prisma.shift.findFirst({ where: { outlet_id: outlet.id, status: 'open' } });
  const [orders, moves] = shift
    ? await Promise.all([
        prisma.order.findMany({ where: { shift_id: shift.id }, include: orderInclude, orderBy: { created_at: 'asc' } }),
        prisma.cashMovement.findMany({ where: { shift_id: shift.id }, orderBy: { created_at: 'asc' } }),
      ])
    : [[], []];

  const ingredients = await readDb(db =>
    db.ingredient.findMany({ where: { outlet_id: outlet.id, is_active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, unit: true, stock: true, min_stock: true } })
  );
  const low = ingredients.filter(i => isLow(i.stock, i.min_stock));
  const tag = deviceTag(deviceId);
  const today = businessDateWIB(now);
  const last = await prisma.order.aggregate({
    where: { outlet_id: outlet.id, business_date: today, code: { contains: `-${tag}-` } },
    _max: { number: true },
  });

  return {
    device_tag: tag,
    day_numbers: { business_date: today, max_number: last._max.number ?? 0 },
    ingredients: ingredients.map(({ id, name, unit }) => ({ id, name, unit })),
    low_stock: { count: low.length, names: low.map(i => i.name) },
    setting: {
      cafe_name: outlet.setting.cafe_name,
      address: outlet.address,
      tax: { name: outlet.setting.tax_name, rate_bp: outlet.setting.tax_rate_bp, inclusive: outlet.setting.tax_inclusive },
      receipt_footer: outlet.setting.receipt_footer,
      receipt_header: outlet.setting.receipt_header,
      receipt_logo: (outlet.setting.receipt_logo as ReceiptLogo | null) ?? null,
    },
    employees,
    categories,
    products,
    promos: promos.map(toPromoRule),
    shift: shift
      ? { id: shift.id, business_date: shift.business_date, opening_float: shift.opening_float, opened_by: shift.opened_by, opened_at: shift.opened_at.toISOString(), status: shift.status as 'open' | 'closed' }
      : null,
    orders: orders.map(toOrderDoc),
    cash_moves: moves.map(
      (m): CashMoveDoc => ({ id: m.id, shift_id: m.shift_id, kind: m.kind as CashMoveDoc['kind'], amount: m.amount, note: m.note, employee_id: m.employee_id, created_at: m.created_at.toISOString() })
    ),
    fetched_at: now.toISOString(),
  };
}
