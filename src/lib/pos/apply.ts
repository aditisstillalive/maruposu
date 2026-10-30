import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { getCurrentOutlet } from '@/lib/outlet';
import { queueSync, type SyncTask } from '@/lib/replica-sync';
import { mutationSchema, type Mutation } from './mutations';
import { computeTotals, lineTotal, splitLineMoney, unitPrice, validatePayment } from './pricing';
import { promoActiveAt } from './promo';
import { toPromoRule } from './promo-map';
import { refundLineAmount, refundTax } from './refund';
import { countedTotal, shiftSummary, type Denominations } from './shift';
import { orderInclude, toOrderDoc } from './snapshot';
import { consumption, costOf } from './inventory';
import { loadRecipe, postStock, recordWasteTx } from './stock';
import type { CartLine, TaxRule } from './types';

type Tx = Prisma.TransactionClient;

export type MutationResult = { id: string; status: 'applied' | 'duplicate' | 'rejected'; error?: string };

/** A rule the mutation breaks. It is recorded and never retried. */
class Rejected extends Error {}

/** True when `e` is a broken rule (answer 4xx), not a failure (5xx). */
export const isRejected = (e: unknown): e is Error => e instanceof Rejected;

const reject = (message: string): never => {
  throw new Rejected(message);
};

type Context = {
  outletId: string;
  deviceId: string;
  tax: TaxRule;
  touchedShifts: Set<string>;
  touchedOrders: Set<string>;
  touchedPromos: Set<string>;
  touchedIngredients: Set<string>;
  wastes: string[];
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
    touchedPromos: new Set(),
    touchedIngredients: new Set(),
    wastes: [],
    auditIds: [],
  };
  const results: MutationResult[] = [];

  try {
    for (const raw of input) results.push(await applyOne(ctx, raw));
  } finally {
    const tasks: SyncTask[] = [
      ...[...ctx.touchedShifts].map(shift => ({ shift })),
      ...(ctx.touchedOrders.size ? [{ orders: [...ctx.touchedOrders] }] : []),
      // used_count changed: the tablet's quota checks read promos from either database
      ...[...ctx.touchedPromos].map(promo => ({ promo })),
      ...ctx.wastes.map(waste => ({ stockDoc: { waste } })),
      ...(ctx.touchedIngredients.size ? [{ ingredients: [...ctx.touchedIngredients] }] : []),
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
      const seen = await tx.posMutation.findUnique({ where: { id: mutation.id } });
      // A resend gets the original verdict, so a lost "rejected" answer isn't turned into success
      if (seen?.status === 'rejected') return { id: mutation.id, status: 'rejected' as const, error: seen.error ?? 'Ditolak server' };
      if (seen) return { id: mutation.id, status: 'duplicate' as const };
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

    case 'shift.close': {
      await requireEmployee(tx, m.employee_id);
      if (countedTotal(m.denominations) !== m.counted_cash) reject('Total hitungan tidak sama dengan rincian pecahan');
      await closeShiftTx(tx, ctx, {
        shiftId: m.shift_id, denominations: m.denominations, note: m.note, closedBy: m.employee_id, via: 'tablet', at,
        clientExpected: m.client_expected,
      }).then(r => ctx.auditIds.push(r.auditId));
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
      const lineMoney = sameMath ? server.lines : clientLineMoney(lines, client, m.client_lines);

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
      if (promoRow) {
        await tx.promo.update({ where: { id: promoRow.id }, data: { used_count: { increment: 1 } } });
        ctx.touchedPromos.add(promoRow.id);
      }

      // Ingredients used, valued at the average cost before this sale
      const recipe = await loadRecipe(tx, ctx.outletId);
      const used = consumption(lines, recipe);
      if (used.size) {
        const posted = await postStock(tx, {
          outletId: ctx.outletId, actor: `employee:${m.employee_id}`, refType: 'order', refId: order.id, note: order.code,
          lines: [...used].map(([ingredient_id, q]) => ({ ingredient_id, qty: -q, kind: 'sale' as const })),
        });
        // Line costs use the same locked averages as the stock movements
        for (const line of lines) {
          const cogs = costOf(consumption([line], recipe), posted.avgUsed);
          if (cogs) await tx.orderItem.update({ where: { id: line.id }, data: { cogs } });
        }
        for (const i of posted.ingredientIds) ctx.touchedIngredients.add(i);
      }
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

    case 'waste.record': {
      await requireEmployee(tx, m.employee_id);
      const posted = await recordWasteTx(tx, {
        id: m.waste_id, outletId: ctx.outletId, source: 'tablet', reason: m.reason, note: m.note,
        actor: `employee:${m.employee_id}`, at, lines: m.lines,
      });
      posted.ingredientIds.forEach(i => ctx.touchedIngredients.add(i));
      ctx.wastes.push(m.waste_id);
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

/**
 * Closes a shift: official expected cash from the DB, variance against the
 * count, and the summary kept for the archive. Used by the tablet's
 * `shift.close` and by the admin (which may void leftover open bills).
 */
export async function closeShiftTx(
  tx: Tx,
  ctx: Pick<Context, 'outletId' | 'tax'> & Partial<Pick<Context, 'touchedOrders'>>,
  input: {
    shiftId: string;
    denominations: Denominations;
    note: string | null;
    closedBy: string;
    via: 'tablet' | 'admin';
    at: Date;
    clientExpected?: number;
    voidOpenWithReason?: string;
  }
): Promise<{ expected: number; variance: number; auditId: string }> {
  // Row lock: a concurrent close, or a sale being synced into this shift, waits for us
  await lockShift(tx, input.shiftId);
  const shift = await tx.shift.findUnique({ where: { id: input.shiftId } });
  if (!shift || shift.outlet_id !== ctx.outletId) return reject('Shift tidak ditemukan');
  if (shift.status !== 'open') reject('Shift sudah ditutup');

  // The tablet refuses to close with open bills, so any left here are bills the
  // server still has open (e.g. a payment it rejected). A close is never refused
  // for that: the bills are voided and the close is flagged.
  const notes: string[] = [];
  const open = await tx.order.findMany({ where: { shift_id: shift.id, status: 'open' }, select: { id: true, code: true } });
  const voidReason = input.via === 'admin' ? `Ditutup admin: ${input.voidOpenWithReason ?? input.note ?? ''}` : 'Ditutup tablet: bill masih terbuka di server';
  if (open.length && input.via === 'tablet') notes.push(`${open.length} open bill di server dibatalkan saat tutup kasir (${open.map(o => o.code).join(', ')})`);
  for (const o of open) {
    await tx.order.update({ where: { id: o.id }, data: { status: 'void', void_reason: voidReason, voided_by: input.closedBy, voided_at: input.at } });
    ctx.touchedOrders?.add(o.id);
  }

  const [orders, moves, refunds] = await Promise.all([
    tx.order.findMany({ where: { shift_id: shift.id }, include: orderInclude }),
    tx.cashMovement.findMany({ where: { shift_id: shift.id } }),
    tx.refund.findMany({ where: { shift_id: shift.id }, include: { items: true } }),
  ]);
  const summary = shiftSummary(
    shift,
    orders.map(toOrderDoc),
    moves.map(mv => ({ ...mv, kind: mv.kind as 'paid_in' | 'paid_out' | 'refund_out', created_at: mv.created_at.toISOString() })),
    refunds.map(r => ({ ...r, method: r.method as 'cash' | 'cashless', created_at: r.created_at.toISOString(), items: r.items }))
  );
  const counted = countedTotal(input.denominations);
  const variance = counted - summary.expected_cash;
  const note = input.note?.trim() || null;
  // The note rule follows what the closer saw: the tablet shows its own variance
  const shownVariance = input.clientExpected !== undefined ? counted - input.clientExpected : variance;
  if (shownVariance !== 0 && !note) reject('Catatan wajib karena ada selisih');

  const differs = input.clientExpected !== undefined && input.clientExpected !== summary.expected_cash;
  if (differs) notes.push(`Tablet menghitung saldo seharusnya ${input.clientExpected}, server ${summary.expected_cash}`);
  const closed = await tx.shift.updateMany({
    where: { id: shift.id, status: 'open' },
    data: {
      status: 'closed', closed_at: input.at, closed_by: input.closedBy, closed_via: input.via,
      denominations: input.denominations, counted_cash: counted, expected_cash: summary.expected_cash,
      client_expected: differs ? input.clientExpected : null, variance, close_note: note,
      sync_note: notes.length ? notes.join('; ') : null,
      summary,
    },
  });
  if (closed.count !== 1) reject('Shift sudah ditutup');
  const actor = input.via === 'admin' ? input.closedBy : `employee:${input.closedBy}`;
  const auditId = await audit(actor, 'shift.close', shift.id, { via: input.via, counted, expected: summary.expected_cash, variance, note, voided: open.map(o => o.id) }, tx);
  return { expected: summary.expected_cash, variance, auditId };
}

/**
 * Per-line money when the server's math disagrees: the tablet's own split if it
 * covers every line and adds up, otherwise the tablet's totals spread over all
 * lines (never negative, unlike spreading over lines the promo matches today).
 */
function clientLineMoney(
  lines: CartLine[],
  client: { subtotal: number; discount: number; total: number },
  sent: Record<string, { discount: number; paid: number }> | undefined
) {
  if (sent && lines.every(l => sent[l.id])) {
    const ok =
      lines.reduce((s, l) => s + sent[l.id].discount, 0) === client.discount &&
      lines.reduce((s, l) => s + sent[l.id].paid, 0) === client.total &&
      lines.every(l => sent[l.id].discount <= lineTotal(l));
    if (ok) return Object.fromEntries(lines.map(l => [l.id, sent[l.id]]));
  }
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  return splitLineMoney(lines, lines.map(l => l.id), Math.min(client.discount, subtotal), client.total);
}

async function requireEmployee(tx: Tx, id: string) {
  if (!(await tx.employee.findUnique({ where: { id }, select: { id: true } }))) reject('Karyawan tidak dikenal');
}

/** Locks the shift row until the transaction ends (no-op if it doesn't exist). */
async function lockShift(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Shift" WHERE id = ${id} FOR UPDATE`;
}

async function requireOpenShift(tx: Tx, id: string) {
  // Writers into a shift wait for a close in progress, then see it closed
  await lockShift(tx, id);
  const shift = await tx.shift.findUnique({ where: { id } });
  if (!shift) reject('Shift tidak ditemukan');
  if (shift!.status !== 'open') reject('Shift sudah ditutup');
}

