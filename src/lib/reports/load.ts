import { readDb } from '@/lib/db-router';
import { prisma } from '@/lib/prisma';
import { businessDateWIB } from '@/lib/pos/codes';
import { addDays } from '@/lib/wib';
import type { Period, ReportData, ReportOrder } from './types';

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_START_HOUR_WIB = 4;

/** UTC instant a business day starts (04:00 WIB). */
const businessDayStart = (date: string) => new Date(new Date(`${date}T00:00:00Z`).getTime() + DAY_START_HOUR_WIB * 3600e3 - WIB_OFFSET_MS);

/** Reads from the primary only: what a cache stores must include writes the replica may not have yet. */
export const primaryOnly: typeof readDb = fn => fn(prisma);

/** Bills (sold and voided) and refunds of a period, read from either database (or `read`). */
export async function loadReportData(outletId: string, period: Period, read: typeof readDb = readDb): Promise<ReportData> {
  const [orders, refunds, employees] = await read(db =>
    Promise.all([
      db.order.findMany({
        where: { outlet_id: outletId, business_date: { gte: period.from, lte: period.to }, status: { in: ['paid', 'refunded', 'void'] } },
        // Only the columns reports use (less egress on long periods)
        select: {
          id: true, code: true, number: true, business_date: true, status: true, order_type: true, customer_name: true, created_by: true, paid_by: true,
          paid_at: true, total: true, subtotal: true, discount: true, tax: true, promo_id: true, promo_name: true, payment_method: true, void_reason: true, voided_by: true, source: true, table_no: true,
          items: {
            select: {
              product_id: true, category_id: true, name: true, qty: true, paid: true, cogs: true, refunded_qty: true, refunded_amount: true,
              options: { select: { name: true } },
            },
            orderBy: { sort_order: 'asc' },
          },
        },
        orderBy: { created_at: 'asc' },
      }),
      db.refund.findMany({
        where: { order: { outlet_id: outletId }, created_at: { gte: businessDayStart(period.from), lt: businessDayStart(addDays(period.to, 1)) } },
        include: { items: { include: { item: { select: { name: true, product_id: true, category_id: true } } } }, order: { select: { code: true } } },
        orderBy: { created_at: 'asc' },
      }),
      db.employee.findMany({ where: { outlet_id: outletId }, select: { id: true, name: true } }),
    ])
  );
  const categoryIds = [
    ...new Set([...orders.flatMap(o => o.items.map(i => i.category_id)), ...refunds.flatMap(r => r.items.map(x => x.item.category_id))].filter((c): c is string => !!c)),
  ];
  const categories = await read(db => db.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } }));
  const categoryName = new Map(categories.map(c => [c.id, c.name]));
  const categoryLabel = (id: string | null) => (!id ? 'Tanpa kategori' : categoryName.get(id) ?? 'Kategori dihapus');

  return {
    period,
    // 'qr' opens customers' table orders; 'otomatis' cancels the ones nobody paid
    employees: { qr: 'Customer (QR)', otomatis: 'Otomatis', ...Object.fromEntries(employees.map(e => [e.id, e.name])) },
    orders: orders.map(o => ({
      id: o.id, code: o.code, number: o.number, business_date: o.business_date, status: o.status as ReportOrder['status'],
      order_type: o.order_type as ReportOrder['order_type'], customer_name: o.customer_name, created_by: o.created_by, paid_by: o.paid_by,
      paid_at: o.paid_at?.toISOString() ?? null, total: o.total, subtotal: o.subtotal, discount: o.discount, tax: o.tax,
      promo_id: o.promo_id, promo_name: o.promo_name, payment_method: o.payment_method as ReportOrder['payment_method'],
      void_reason: o.void_reason, voided_by: o.voided_by, source: o.source as 'pos' | 'qr', table_no: o.table_no,
      items: o.items.map(i => ({
        product_id: i.product_id ?? '', category_id: i.category_id ?? '', category_name: categoryLabel(i.category_id),
        name: i.name, qty: i.qty, paid: i.paid, cogs: i.cogs, refunded_qty: i.refunded_qty, refunded_amount: i.refunded_amount,
        options: i.options.map(op => op.name),
      })),
    })),
    refunds: refunds.map(r => ({
      id: r.id, order_id: r.order_id, order_code: r.order.code, business_date: businessDateWIB(r.created_at), method: r.method as 'cash' | 'cashless',
      amount: r.amount, tax: r.tax, reason: r.reason, employee_id: r.employee_id, created_at: r.created_at.toISOString(),
      items: r.items.map(x => ({
        name: x.item.name, product_id: x.item.product_id ?? '', category_id: x.item.category_id ?? '',
        category_name: categoryLabel(x.item.category_id), qty: x.qty, amount: x.amount,
      })),
    })),
  };
}
