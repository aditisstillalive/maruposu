import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { getCurrentOutlet } from '@/lib/outlet';
import { queueSync, type SyncTask } from '@/lib/replica-sync';
import { mutationSchema, type Mutation } from './mutations';
import { computeTotals, splitLineMoney, unitPrice, validatePayment } from './pricing';
import { promoActiveAt, promoLines } from './promo';
import { toPromoRule } from './promo-map';
import { refundLineAmount, refundTax } from './refund';
import type { CartLine, TaxRule } from './types';

type Tx = Prisma.TransactionClient;

export type MutationResult = { id: string; status: 'applied' | 'duplicate' | 'rejected'; error?: string };

/** A rule the mutation breaks. It is recorded and never retried. */
class Rejected extends Error {}

const reject = (message: string): never => {
  throw new Rejected(message);
};

type Context = {
  outletId: string;
  deviceId: string;
  tax: TaxRule;
  touchedShifts: Set<string>;
  touchedOrders: Set<string>;
  auditIds: string[];
};

/**
 * Applies the tablet's queued mutations in order, each in its own transaction.
 * A mutation id seen before is a `duplicate` with no effect; one that breaks a
 * rule is `rejected` (and remembered, so a resend stays rejected). Database
 * failures throw: the caller answers 5xx and the tablet keeps its queue.
 */
export async function applyMutations(deviceId: string, input: unknown[]): Promise<{ results: MutationResult[] }> {
  const outlet = await getCurrentOutlet();
  const ctx: Context = {
    outletId: outlet.id,
    deviceId,
    tax: { name: outlet.setting.tax_name, rate_bp: outlet.setting.tax_rate_bp, inclusive: outlet.setting.tax_inclusive },
    touchedShifts: new Set(),
    touchedOrders: new Set(),
    auditIds: [],
  };
  const results: MutationResult[] = [];

  try {
    for (const raw of input) results.push(await applyOne(ctx, raw));
  } finally {
    const tasks: SyncTask[] = [
      ...[...ctx.touchedShifts].map(shift => ({ shift })),
      ...(ctx.touchedOrders.size ? [{ orders: [...ctx.touchedOrders] }] : []),
      ...ctx.auditIds.map(auditLog => ({ auditLog })),
    ];
    queueSync(...tasks);
  }
  return { results };
}

async function applyOne(ctx: Context, raw: unknown): Promise<MutationResult> {
  const rawId = typeof (raw as { id?: unknown })?.id === 'string' ? (raw as { id: string }).id : null;
  const parsed = mutationSchema.safeParse(raw);
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message ?? 'Data tidak valid';
    if (rawId) await remember(rawId, ctx.deviceId, (raw as { type?: string }).type ?? '?', error);
    return { id: rawId ?? '?', status: 'rejected', error };
  }
  const mutation = parsed.data;

  try {
    return await prisma.$transaction(async tx => {
      if (await tx.posMutation.findUnique({ where: { id: mutation.id } })) return { id: mutation.id, status: 'duplicate' as const };
      await apply(tx, ctx, mutation);
      await tx.posMutation.create({ data: { id: mutation.id, device_id: ctx.deviceId, type: mutation.type, status: 'applied' } });
      return { id: mutation.id, status: 'applied' as const };
    }, { timeout: 20_000 });
  } catch (e) {
    if (!(e instanceof Rejected)) throw e;
    await remember(mutation.id, ctx.deviceId, mutation.type, e.message);
    return { id: mutation.id, status: 'rejected', error: e.message };
  }
}

async function remember(id: string, deviceId: string, type: string, error: string) {
  await prisma.posMutation.upsert({
    where: { id },
    create: { id, device_id: deviceId, type, status: 'rejected', error },
    update: {},
  });
}

async function apply(tx: Tx, ctx: Context, m: Mutation) {
  const at = new Date(m.created_at);
  switch (m.type) {
    case 'shift.open': {
      await requireEmployee(tx, m.employee_id);
      const open = await tx.shift.findFirst({ where: { outlet_id: ctx.outletId, status: 'open' } });
      if (open && open.id !== m.shift_id) reject('Masih ada shift lain yang terbuka');
      if (open) return; // the same shift resent under a new mutation id
      await tx.shift.create({
        data: {
          id: m.shift_id, outlet_id: ctx.outletId, device_id: ctx.deviceId, business_date: m.business_date,
          opening_float: m.opening_float, opened_by: m.employee_id, opened_at: at,
        },
      });
      ctx.touchedShifts.add(m.shift_id);
      return;
    }

    case 'order.save': {
      const o = m.order;
      await requireEmployee(tx, o.created_by);
      await requireOpenShift(tx, o.shift_id);
      const existing = await tx.order.findUnique({ where: { id: o.id } });
      if (existing && existing.status !== 'open') reject('Bill sudah dibayar atau dibatalkan');
      const header = {
        shift_id: o.shift_id, code: o.code, number: o.number, business_date: o.business_date, order_type: o.order_type,
        customer_name: o.customer_name || null, table_no: o.table_no || null,
      };
      if (existing) {
        await tx.order.update({ where: { id: o.id }, data: header });
        await tx.orderItem.deleteMany({ where: { order_id: o.id } });
      } else {
        await tx.order.create({ data: { id: o.id, outlet_id: ctx.outletId, ...header, created_by: o.created_by, created_at: new Date(o.created_at) } });
      }
      for (const item of o.items) {
        await tx.orderItem.create({
          data: {
            id: item.id, order_id: o.id, product_id: item.product_id || null, category_id: item.category_id || null,
            name: item.name, base_price: item.base_price, unit_price: unitPrice(item), qty: item.qty,
            note: item.note || null, sort_order: item.sort_order,
            options: { create: item.options.map(opt => ({ option_id: opt.option_id || null, group_name: opt.group_name, name: opt.name, price_delta: opt.price_delta })) },
          },
        });
      }
      ctx.touchedOrders.add(o.id);
      return;
    }

    case 'order.pay': {
      await requireEmployee(tx, m.employee_id);
      const order = await tx.order.findUnique({ where: { id: m.order_id }, include: { items: { include: { options: true }, orderBy: { sort_order: 'asc' } } } });
      if (!order) return reject('Bill tidak ditemukan');
      if (order.status !== 'open') reject('Bill sudah dibayar atau dibatalkan');

      const client = m.client_totals;
      const paymentError = validatePayment(m.method, client.total, m.cash_received);
      if (paymentError) reject(paymentError);

      const lines: CartLine[] = order.items.map(i => ({
        id: i.id, product_id: i.product_id ?? '', category_id: i.category_id ?? '', name: i.name, base_price: i.base_price,
        options: i.options.map(o => ({ option_id: o.option_id ?? '', group_name: o.group_name, name: o.name, price_delta: o.price_delta })),
        qty: i.qty, note: i.note,
      }));

      const notes: string[] = [];
      const promoRow = m.promo_id ? await tx.promo.findUnique({ where: { id: m.promo_id } }) : null;
      if (m.promo_id && !promoRow) notes.push('Promo sudah dihapus');
      const promo = promoRow ? toPromoRule(promoRow) : null;
      if (promo && !promoActiveAt({ ...promo, quota: null }, at)) notes.push('Promo tidak berlaku saat dibayar');
      if (promo && promo.quota !== null && promo.used_count >= promo.quota) notes.push('Kuota promo terlampaui');
      const usable = promo && notes.length === 0 ? promo : null;

      const server = computeTotals(lines, usable, ctx.tax);
      const sameMath = server.subtotal === client.subtotal && server.discount === client.discount && server.total === client.total;
      if (!sameMath) notes.push(`Hitungan tablet beda dari server (server: total ${server.total}, diskon ${server.discount})`);

      // The tablet's numbers are what the customer actually paid
      const lineMoney = sameMath
        ? server.lines
        : splitLineMoney(lines, promo ? promoLines(promo, lines).map(l => l.id) : lines.map(l => l.id), client.discount, client.total);

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'paid', paid_by: m.employee_id, paid_at: at,
          subtotal: client.subtotal, discount: client.discount, tax: client.tax, total: client.total,
          promo_id: promoRow?.id ?? null, promo_name: promoRow?.name ?? null,
          payment_method: m.method, cash_received: m.method === 'cash' ? m.cash_received : null,
          change: m.method === 'cash' ? (m.cash_received ?? 0) - client.total : null,
          payment_ref: m.payment_ref || null, sync_note: notes.length ? notes.join('; ') : null,
        },
      });
      for (const line of lines) {
        await tx.orderItem.update({ where: { id: line.id }, data: lineMoney[line.id] });
      }
      if (promoRow) await tx.promo.update({ where: { id: promoRow.id }, data: { used_count: { increment: 1 } } });
      ctx.touchedOrders.add(order.id);
      return;
    }

    case 'order.void': {
      await requireEmployee(tx, m.employee_id);
      const order = await tx.order.findUnique({ where: { id: m.order_id } });
      if (!order) return reject('Bill tidak ditemukan');
      if (order.status !== 'open') reject('Hanya bill yang belum dibayar yang bisa dibatalkan; gunakan refund');
      await tx.order.update({ where: { id: order.id }, data: { status: 'void', void_reason: m.reason, voided_by: m.employee_id, voided_at: at } });
      ctx.auditIds.push(await audit(`employee:${m.employee_id}`, 'order.void', order.id, { code: order.code, reason: m.reason }, tx));
      ctx.touchedOrders.add(order.id);
      return;
    }

    case 'order.refund': {
      await requireEmployee(tx, m.employee_id);
      const order = await tx.order.findUnique({ where: { id: m.order_id }, include: { items: true } });
      if (!order) return reject('Bill tidak ditemukan');
      if (order.status !== 'paid') reject('Hanya bill lunas yang bisa di-refund');
      const shift = await tx.shift.findFirst({ where: { outlet_id: ctx.outletId, status: 'open' } });
      if (!shift) return reject('Tidak ada shift terbuka');

      const rows: { order_item_id: string; qty: number; amount: number }[] = [];
      for (const req of m.items) {
        const item = order.items.find(i => i.id === req.order_item_id);
        if (!item) return reject('Item tidak ada di bill ini');
        if (req.qty > item.qty - item.refunded_qty) reject(`Jumlah refund ${item.name} melebihi sisa`);
        const amount = refundLineAmount(item, req.qty, { qty: item.refunded_qty, amount: item.refunded_amount });
        rows.push({ order_item_id: item.id, qty: req.qty, amount });
        await tx.orderItem.update({
          where: { id: item.id },
          data: { refunded_qty: { increment: req.qty }, refunded_amount: { increment: amount } },
        });
      }
      const amount = rows.reduce((s, r) => s + r.amount, 0);
      await tx.refund.create({
        data: {
          id: m.refund_id, order_id: order.id, shift_id: shift.id, method: m.method, amount, tax: refundTax(amount, ctx.tax),
          reason: m.reason, employee_id: m.employee_id, created_at: at,
          items: { create: rows.map(r => ({ id: crypto.randomUUID(), ...r })) },
        },
      });
      if (m.method === 'cash') {
        await tx.cashMovement.create({
          data: { id: m.refund_id, shift_id: shift.id, kind: 'refund_out', amount, note: `Refund ${order.code}: ${m.reason}`, employee_id: m.employee_id, refund_id: m.refund_id, created_at: at },
        });
      }
      const left = await tx.orderItem.count({ where: { order_id: order.id, refunded_qty: { lt: tx.orderItem.fields.qty } } });
      if (left === 0) await tx.order.update({ where: { id: order.id }, data: { status: 'refunded' } });
      ctx.auditIds.push(await audit(`employee:${m.employee_id}`, 'order.refund', order.id, { code: order.code, method: m.method, amount, reason: m.reason, items: rows }, tx));
      ctx.touchedOrders.add(order.id);
      return;
    }

    case 'cash.move': {
      await requireEmployee(tx, m.employee_id);
      await requireOpenShift(tx, m.shift_id);
      await tx.cashMovement.create({
        data: { id: m.movement_id, shift_id: m.shift_id, kind: m.kind, amount: m.amount, note: m.note, employee_id: m.employee_id, created_at: at },
      });
      ctx.auditIds.push(await audit(`employee:${m.employee_id}`, `cash.${m.kind}`, m.movement_id, { amount: m.amount, note: m.note }, tx));
      ctx.touchedShifts.add(m.shift_id);
      return;
    }
  }
}

async function requireEmployee(tx: Tx, id: string) {
  if (!(await tx.employee.findUnique({ where: { id }, select: { id: true } }))) reject('Karyawan tidak dikenal');
}

async function requireOpenShift(tx: Tx, id: string) {
  const shift = await tx.shift.findUnique({ where: { id } });
  if (!shift) reject('Shift tidak ditemukan');
  if (shift!.status !== 'open') reject('Shift sudah ditutup');
}

