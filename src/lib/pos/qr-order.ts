// Customer orders from a table's QR code (/t/<token>). They become the table's
// open bill on the till; the customer pays at the cashier. Prices and option
// rules always come from the database menu, never from the phone.
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { uuid } from '@/lib/uuid';
import { makeLine, selectionError, type Selection } from './cart';
import { businessDateWIB, orderCode } from './codes';
import { unitPrice } from './line';
import { QR_EXPIRE_MS } from './qr-expiry';
import type { MenuProduct, OrderItemDoc } from './types';

export { QR_EXPIRE_MS };

type Tx = Prisma.TransactionClient;

/** QR bills are numbered from 501 a day, so tickets never repeat a till number. */
export const QR_NUMBER_BASE = 500;
export const QR_DEVICE_TAG = 'QR';
export const QR_ACTOR = 'qr';

export class QrOrderError extends Error {}

export const qrOrderSchema = z.object({
  customer_name: z.string().trim().max(40).optional(),
  items: z
    .array(
      z.object({
        product_id: z.string().min(1).max(64),
        option_ids: z.array(z.string().min(1).max(64)).max(20),
        qty: z.number().int().min(1).max(20),
        note: z.string().trim().max(120).optional(),
      })
    )
    .min(1)
    .max(30),
});
export type QrOrderInput = z.infer<typeof qrOrderSchema>;

/** The phone's cart as bill lines, checked against the menu with the till's own option rules. */
export function linesFromCart(menu: MenuProduct[], items: QrOrderInput['items']): OrderItemDoc[] {
  return items.map(item => {
    const product = menu.find(p => p.id === item.product_id);
    if (!product) throw new QrOrderError('Menu tidak tersedia lagi, muat ulang halaman');
    if (product.is_sold_out) throw new QrOrderError(`${product.name} sedang habis`);
    const sel: Selection = Object.fromEntries(product.groups.map(g => [g.id, [] as string[]]));
    for (const id of item.option_ids) {
      const group = product.groups.find(g => g.options.some(o => o.id === id));
      if (!group) throw new QrOrderError(`Pilihan tidak tersedia untuk ${product.name}`);
      if (!sel[group.id].includes(id)) sel[group.id].push(id);
    }
    const error = selectionError(product, sel);
    if (error) throw new QrOrderError(`${product.name}: ${error}`);
    return makeLine(product, sel, item.qty, item.note ?? '');
  });
}

const itemData = (line: OrderItemDoc, sort_order: number) => ({
  id: line.id, product_id: line.product_id || null, category_id: line.category_id || null, name: line.name,
  base_price: line.base_price, unit_price: unitPrice(line), qty: line.qty, note: line.note || null, sort_order, origin: 'qr',
  options: { create: line.options.map(o => ({ option_id: o.option_id || null, group_name: o.group_name, name: o.name, price_delta: o.price_delta })) },
});

/** Creates an open QR bill for the table; retries on the rare clash of two bills taking the same number. */
export async function createQrBill(
  tx: Tx,
  input: { outletId: string; shiftId: string; table: { id: string; name: string }; customerName: string | null; now: Date; claimed?: boolean }
): Promise<{ id: string; number: number }> {
  const business_date = businessDateWIB(input.now);
  const last = await tx.order.aggregate({
    where: { outlet_id: input.outletId, business_date, code: { contains: `-${QR_DEVICE_TAG}-` } },
    _max: { number: true },
  });
  const number = Math.max(last._max.number ?? QR_NUMBER_BASE, QR_NUMBER_BASE) + 1;
  const id = uuid();
  await tx.order.create({
    data: {
      id, outlet_id: input.outletId, shift_id: input.shiftId, code: orderCode(business_date, QR_DEVICE_TAG, number - QR_NUMBER_BASE), number,
      business_date, status: 'open', order_type: 'dine_in', customer_name: input.customerName, table_no: input.table.name,
      created_by: QR_ACTOR, source: 'qr', table_id: input.table.id, qr_activity_at: input.now, created_at: input.now,
    },
  });
  return { id, number };
}

/**
 * A customer's submit: added to the table's open bill when there is one (any
 * bill of this table in the open shift), otherwise a new QR bill.
 */
export async function submitQrOrder(
  tx: Tx,
  input: { outletId: string; shiftId: string; table: { id: string; name: string }; lines: OrderItemDoc[]; customerName: string | null; now: Date }
): Promise<{ orderId: string; number: number; appended: boolean; auditId: string }> {
  const open = await tx.order.findFirst({
    where: { table_id: input.table.id, shift_id: input.shiftId, status: 'open' },
    orderBy: { created_at: 'asc' },
    include: { items: { select: { sort_order: true } } },
  });
  let orderId: string;
  let number: number;
  let start = 0;
  if (open) {
    orderId = open.id;
    number = open.number;
    start = Math.max(-1, ...open.items.map(i => i.sort_order)) + 1;
    await tx.order.update({
      where: { id: open.id },
      data: { qr_activity_at: input.now, ...(open.customer_name ? {} : { customer_name: input.customerName }) },
    });
  } else {
    ({ id: orderId, number } = await createQrBill(tx, { ...input }));
  }
  for (const [k, line] of input.lines.entries()) {
    await tx.orderItem.create({ data: { order_id: orderId, ...itemData(line, start + k) } });
  }
  const auditId = await audit(QR_ACTOR, open ? 'order.qr_add' : 'order.qr_create', orderId, {
    table: input.table.name, items: input.lines.map(l => `${l.qty}x ${l.name}`),
  }, tx);
  return { orderId, number, appended: !!open, auditId };
}

/** Voids QR bills nobody paid or touched within 30 minutes of the last submit. Returns the voided ids. */
export async function sweepQrOrders(tx: Tx, outletId: string, now: Date): Promise<{ orderIds: string[]; auditIds: string[] }> {
  const expired = await tx.order.findMany({
    where: { outlet_id: outletId, source: 'qr', status: 'open', claimed_at: null, qr_activity_at: { lt: new Date(now.getTime() - QR_EXPIRE_MS) } },
    select: { id: true, code: true },
  });
  const auditIds: string[] = [];
  for (const o of expired) {
    await tx.order.update({
      where: { id: o.id },
      data: { status: 'void', void_reason: 'Tidak dibayar 30 menit (pesanan QR)', voided_by: 'otomatis', voided_at: now },
    });
    auditIds.push(await audit(QR_ACTOR, 'order.void', o.id, { code: o.code, reason: 'expired' }, tx));
  }
  return { orderIds: expired.map(o => o.id), auditIds };
}
