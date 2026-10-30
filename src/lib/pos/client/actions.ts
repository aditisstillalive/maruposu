// Everything the cashier does on the tablet. Each action writes the local
// document and queues the matching mutation in ONE Dexie transaction, so the
// screen and the outbox can never disagree.
import { db, getKV, seqKey, setKV, type OutboxEntry } from './db';
import { businessDateWIB, orderCode } from '../codes';
import { computeTotals, validatePayment } from '../pricing';
import { refundLineAmount, refundTax } from '../refund';
import type { Mutation, OrderInput } from '../mutations';
import type { CashMoveDoc, OrderDoc, OrderType, PaymentMethod, PromoRule, RefundDoc, ShiftDoc, SnapshotEmployee } from '../types';

const tables = () => [db.orders, db.cash_moves, db.outbox, db.kv];
const uuid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

type MutationBody = Mutation extends infer M ? (M extends Mutation ? Omit<M, 'id' | 'created_at'> : never) : never;

async function enqueue(ref: string, body: MutationBody): Promise<void> {
  const mutation = { ...body, id: uuid(), created_at: nowIso() } as Mutation;
  await db.outbox.add({ id: mutation.id, ref, mutation } satisfies OutboxEntry);
  requestSyncSoon();
}

// Set by the sync loop so a local write is pushed without waiting for the timer.
let onWrite: (() => void) | null = null;
export function setWriteListener(fn: (() => void) | null) {
  onWrite = fn;
}
function requestSyncSoon() {
  onWrite?.();
}

async function requireShift(): Promise<ShiftDoc> {
  const shift = await getKV('shift');
  if (!shift || shift.status !== 'open') throw new Error('Kasir belum dibuka');
  return shift;
}

async function requireOrder(id: string): Promise<OrderDoc> {
  const order = await db.orders.get(id);
  if (!order) throw new Error('Bill tidak ditemukan');
  return order;
}

export async function setCashier(employee: SnapshotEmployee | null): Promise<void> {
  await setKV('cashier', employee);
}

export async function openShift(openingFloat: number, employeeId: string): Promise<ShiftDoc> {
  return db.transaction('rw', tables(), async () => {
    const current = await getKV('shift');
    if (current?.status === 'open') throw new Error('Kasir sudah dibuka');
    const now = new Date();
    const shift: ShiftDoc = {
      id: uuid(), business_date: businessDateWIB(now), opening_float: openingFloat,
      opened_by: employeeId, opened_at: now.toISOString(), status: 'open',
    };
    await setKV('shift', shift);
    await enqueue(shift.id, { type: 'shift.open', shift_id: shift.id, opening_float: openingFloat, employee_id: employeeId, business_date: shift.business_date });
    return shift;
  });
}

/** A fresh, unsaved bill with the next number of the shift's business day. */
export async function newOrder(meta: { order_type: OrderType; customer_name: string | null; table_no: string | null; created_by: string }): Promise<OrderDoc> {
  return db.transaction('rw', tables(), async () => {
    const shift = await requireShift();
    const tag = (await getKV('device_tag')) ?? '00';
    const key = seqKey(shift.business_date);
    const stored = ((await db.kv.get(key))?.value as number | undefined) ?? 0;
    // Orders synced from the server (e.g. after reinstalling) count too
    const known = await db.orders.where('business_date').equals(shift.business_date).toArray();
    const number = Math.max(stored, ...known.map(o => o.number)) + 1;
    await db.kv.put({ key, value: number });
    return {
      id: uuid(), shift_id: shift.id, code: orderCode(shift.business_date, tag, number), number, business_date: shift.business_date,
      status: 'open', order_type: meta.order_type, customer_name: meta.customer_name, table_no: meta.table_no, created_by: meta.created_by,
      paid_by: null, subtotal: 0, discount: 0, tax: 0, total: 0, promo_id: null, promo_name: null, payment_method: null,
      cash_received: null, change: null, payment_ref: null, paid_at: null, void_reason: null, created_at: nowIso(), items: [], refunds: [],
    };
  });
}

function toOrderInput(o: OrderDoc): OrderInput {
  return {
    id: o.id, shift_id: o.shift_id, code: o.code, number: o.number, business_date: o.business_date, order_type: o.order_type,
    customer_name: o.customer_name, table_no: o.table_no, created_by: o.created_by, created_at: o.created_at,
    items: o.items.map((i, sort_order) => ({
      id: i.id, product_id: i.product_id, category_id: i.category_id, name: i.name, base_price: i.base_price,
      options: i.options, qty: i.qty, note: i.note, sort_order,
    })),
  };
}

/** Saves an open bill (new or edited). */
export async function saveOrder(order: OrderDoc): Promise<OrderDoc> {
  if (order.items.length === 0) throw new Error('Bill masih kosong');
  return db.transaction('rw', tables(), async () => {
    const existing = await db.orders.get(order.id);
    if (existing && existing.status !== 'open') throw new Error('Bill sudah dibayar atau dibatalkan');
    const saved: OrderDoc = { ...order, status: 'open', items: order.items.map((i, sort_order) => ({ ...i, sort_order })) };
    await db.orders.put(saved);
    await enqueue(saved.id, { type: 'order.save', order: toOrderInput(saved) });
    return saved;
  });
}

export type Payment = { method: PaymentMethod; cash_received: number | null; payment_ref: string | null; employee_id: string; promo: PromoRule | null };

export async function payOrder(orderId: string, p: Payment): Promise<OrderDoc> {
  return db.transaction('rw', tables(), async () => {
    const order = await requireOrder(orderId);
    if (order.status !== 'open') throw new Error('Bill sudah dibayar atau dibatalkan');
    const snapshot = await getKV('snapshot');
    if (!snapshot) throw new Error('Data menu belum tersedia');

    const totals = computeTotals(order.items, p.promo, snapshot.setting.tax);
    const error = validatePayment(p.method, totals.total, p.cash_received);
    if (error) throw new Error(error);

    const cash = p.method === 'cash';
    const paid: OrderDoc = {
      ...order, status: 'paid', paid_by: p.employee_id, paid_at: nowIso(),
      subtotal: totals.subtotal, discount: totals.discount, tax: totals.tax, total: totals.total,
      promo_id: p.promo?.id ?? null, promo_name: p.promo?.name ?? null, payment_method: p.method,
      cash_received: cash ? p.cash_received : null, change: cash ? (p.cash_received ?? 0) - totals.total : null,
      payment_ref: p.payment_ref || null,
      items: order.items.map(i => ({ ...i, ...totals.lines[i.id] })),
    };
    await db.orders.put(paid);
    if (p.promo) {
      // Count the use locally too, so an offline tablet sees the quota running out
      const promos = snapshot.promos.map(x => (x.id === p.promo!.id ? { ...x, used_count: x.used_count + 1 } : x));
      await setKV('snapshot', { ...snapshot, promos });
    }
    await enqueue(order.id, {
      type: 'order.pay', order_id: order.id, promo_id: p.promo?.id ?? null, method: p.method,
      cash_received: cash ? p.cash_received : null, payment_ref: p.payment_ref || null, employee_id: p.employee_id,
      client_totals: { subtotal: totals.subtotal, discount: totals.discount, tax: totals.tax, total: totals.total },
      client_lines: totals.lines,
    });
    return paid;
  });
}

export async function voidOrder(orderId: string, reason: string, employeeId: string): Promise<void> {
  if (!reason.trim()) throw new Error('Alasan wajib diisi');
  await db.transaction('rw', tables(), async () => {
    const order = await requireOrder(orderId);
    if (order.status !== 'open') throw new Error('Hanya bill yang belum dibayar yang bisa dibatalkan');
    await db.orders.put({ ...order, status: 'void', void_reason: reason.trim() });
    await enqueue(order.id, { type: 'order.void', order_id: order.id, reason: reason.trim(), employee_id: employeeId });
  });
}

export async function refundOrder(
  orderId: string,
  items: { order_item_id: string; qty: number }[],
  method: 'cash' | 'cashless',
  reason: string,
  employeeId: string
): Promise<RefundDoc> {
  if (!reason.trim()) throw new Error('Alasan wajib diisi');
  const wanted = items.filter(i => i.qty > 0);
  if (!wanted.length) throw new Error('Pilih item yang di-refund');
  return db.transaction('rw', tables(), async () => {
    const order = await requireOrder(orderId);
    if (order.status !== 'paid') throw new Error('Hanya bill lunas yang bisa di-refund');
    const shift = await requireShift();
    const snapshot = await getKV('snapshot');

    const rows = wanted.map(w => {
      const item = order.items.find(i => i.id === w.order_item_id);
      if (!item) throw new Error('Item tidak ada di bill ini');
      if (w.qty > item.qty - item.refunded_qty) throw new Error(`Jumlah refund ${item.name} melebihi sisa`);
      return { order_item_id: item.id, qty: w.qty, amount: refundLineAmount(item, w.qty, { qty: item.refunded_qty, amount: item.refunded_amount }) };
    });
    const amount = rows.reduce((s, r) => s + r.amount, 0);
    const refund: RefundDoc = {
      id: uuid(), shift_id: shift.id, method, amount, tax: snapshot ? refundTax(amount, snapshot.setting.tax) : 0, reason: reason.trim(),
      employee_id: employeeId, created_at: nowIso(), items: rows,
    };
    const updatedItems = order.items.map(i => {
      const r = rows.find(x => x.order_item_id === i.id);
      return r ? { ...i, refunded_qty: i.refunded_qty + r.qty, refunded_amount: i.refunded_amount + r.amount } : i;
    });
    const fully = updatedItems.every(i => i.refunded_qty >= i.qty);
    await db.orders.put({ ...order, status: fully ? 'refunded' : 'paid', items: updatedItems, refunds: [...order.refunds, refund] });
    if (method === 'cash') {
      await db.cash_moves.put({
        id: refund.id, shift_id: shift.id, kind: 'refund_out', amount, note: `Refund ${order.code}: ${refund.reason}`,
        employee_id: employeeId, created_at: refund.created_at,
      });
    }
    await enqueue(order.id, { type: 'order.refund', refund_id: refund.id, order_id: order.id, method, reason: refund.reason, employee_id: employeeId, items: wanted });
    return refund;
  });
}

export async function addCashMove(kind: 'paid_in' | 'paid_out', amount: number, note: string, employeeId: string): Promise<CashMoveDoc> {
  if (!(amount > 0)) throw new Error('Nominal harus lebih dari 0');
  if (!note.trim()) throw new Error('Keterangan wajib diisi');
  return db.transaction('rw', tables(), async () => {
    const shift = await requireShift();
    const move: CashMoveDoc = { id: uuid(), shift_id: shift.id, kind, amount, note: note.trim(), employee_id: employeeId, created_at: nowIso() };
    await db.cash_moves.put(move);
    await enqueue(shift.id, { type: 'cash.move', movement_id: move.id, shift_id: shift.id, kind, amount, note: move.note, employee_id: employeeId });
    return move;
  });
}
