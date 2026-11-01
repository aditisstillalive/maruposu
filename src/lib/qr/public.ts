// Reads for the public QR pages. Cached (dropped on every write via queueSync)
// because anyone at a table can load them; prices are re-checked on submit.
import type { Prisma } from '@prisma/client';
import { cachedRead } from '@/lib/data-cache';
import { prisma } from '@/lib/prisma';
import { loadMenu } from '@/lib/pos/menu';
import { lineTotal } from '@/lib/pos/line';
import { computeTotals } from '@/lib/pos/pricing';
import type { TaxRule } from '@/lib/pos/types';

export type PublicTable = { id: string; outlet_id: string; name: string };

/** An active table by its QR token, or null. */
export async function tableByToken(token: string): Promise<PublicTable | null> {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return null;
  return cachedRead(`qr-table:${token}`, async () =>
    prisma.diningTable.findFirst({ where: { token, is_active: true }, select: { id: true, outlet_id: true, name: true } })
  )();
}

export async function publicOutlet(outletId: string) {
  return cachedRead(`qr-outlet:${outletId}`, async () => {
    const [outlet, shift, menu] = await Promise.all([
      prisma.outlet.findUniqueOrThrow({ where: { id: outletId }, include: { setting: true } }),
      prisma.shift.findFirst({ where: { outlet_id: outletId, status: 'open' }, select: { id: true } }),
      loadMenu(prisma, outletId),
    ]);
    const s = outlet.setting!;
    const tax: TaxRule = { name: s.tax_name, rate_bp: s.tax_rate_bp, inclusive: s.tax_inclusive };
    return { cafe_name: s.cafe_name, tax, open: !!shift, ...menu };
  })();
}

export type PublicOrderStatus = 'waiting' | 'paid' | 'void';

/**
 * The table's open QR bill started after this one, e.g. where items that came
 * in while the cashier was taking payment were moved to.
 */
export async function laterOpenBill(
  db: Prisma.TransactionClient,
  o: { id: string; table_id: string | null; created_at: Date }
): Promise<{ id: string; number: number } | null> {
  if (!o.table_id) return null;
  return db.order.findFirst({
    where: { table_id: o.table_id, source: 'qr', status: 'open', id: { not: o.id }, created_at: { gte: o.created_at } },
    orderBy: { created_at: 'asc' },
    select: { id: true, number: true },
  });
}

/** A table's bill as the customer sees it; null when it isn't this table's. */
export async function publicOrder(table: PublicTable, orderId: string) {
  if (!/^[0-9a-f-]{36}$/.test(orderId)) return null;
  const view = await cachedRead(`qr-order:${orderId}`, async () => {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { options: true }, orderBy: { sort_order: 'asc' } }, outlet: { include: { setting: true } } },
    });
    if (!o) return null;
    const s = o.outlet.setting!;
    const lines = o.items.map(i => ({
      id: i.id, product_id: i.product_id ?? '', category_id: i.category_id ?? '', name: i.name, base_price: i.base_price, qty: i.qty, note: i.note,
      options: i.options.map(x => ({ option_id: x.option_id ?? '', group_name: x.group_name, name: x.name, price_delta: x.price_delta })),
    }));
    const open = o.status === 'open';
    const totals = open ? computeTotals(lines, null, { name: s.tax_name, rate_bp: s.tax_rate_bp, inclusive: s.tax_inclusive }) : null;
    const status: PublicOrderStatus = open ? 'waiting' : o.status === 'void' ? 'void' : 'paid';
    return {
      table_id: o.table_id, number: o.number, status, void_reason: o.void_reason, customer_name: o.customer_name,
      total: open ? totals!.total : o.total,
      items: lines.map(l => ({ id: l.id, name: l.name, qty: l.qty, note: l.note, options: l.options.map(x => x.name), total: lineTotal(l) })),
      next: open ? null : await laterOpenBill(prisma, o),
    };
  })();
  return view && view.table_id === table.id ? view : null;
}
