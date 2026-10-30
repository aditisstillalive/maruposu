import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getKV } from './db';
import { addCashMove, closeShift, getCountLock, lockCount, newOrder, openShift, payOrder, saveOrder, setCashier } from './actions';
import { applySnapshot } from './sync';
import type { OrderDoc, Snapshot } from '../types';

const RANI = { id: 'emp-rani', name: 'Rani', photo_url: null };
const snapshot: Snapshot = {
  device_tag: 'A7',
  setting: { cafe_name: 'Maraca', address: null, tax: { name: 'PB1', rate_bp: 1000, inclusive: true }, receipt_footer: null },
  employees: [RANI], categories: [], products: [], promos: [], shift: null, orders: [], cash_moves: [], fetched_at: '2026-10-30T02:00:00.000Z',
  day_numbers: { business_date: '2000-01-01', max_number: 0 },
};

const item = (id: string, price: number): OrderDoc['items'][number] => ({
  id, product_id: 'p', category_id: 'c', name: 'Croissant', base_price: price, options: [], qty: 1, note: null,
  sort_order: 0, discount: 0, paid: 0, refunded_qty: 0, refunded_amount: 0,
});

async function cashSale(price = 20000) {
  const o = await newOrder({ order_type: 'takeaway', customer_name: null, table_no: null, created_by: RANI.id });
  await saveOrder({ ...o, items: [item(crypto.randomUUID(), price)] });
  return payOrder(o.id, { method: 'cash', cash_received: price, payment_ref: null, employee_id: RANI.id, promo: null });
}

/** Float 200 000 + cash sale 20 000 − paid out 5 000 → expected 215 000 */
async function busyShift() {
  await applySnapshot(snapshot);
  await setCashier(RANI);
  await openShift(200000, RANI.id);
  await cashSale();
  await addCashMove('paid_out', 5000, 'Es batu', RANI.id);
}

const exact = { notes: { '100000': 2, '10000': 1, '5000': 1 }, coins: 0 };
const short = { notes: { '100000': 2, '10000': 1 }, coins: 4000 };

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('lockCount', () => {
  it('shows the variance once the count is locked', async () => {
    await busyShift();
    expect(await lockCount(exact, RANI.id)).toMatchObject({ counted: 215000, expected: 215000, variance: 0 });
  });

  it('locking twice keeps the first count', async () => {
    await busyShift();
    await lockCount(short, RANI.id);
    expect(await lockCount(exact, RANI.id)).toMatchObject({ counted: 214000, variance: -1000 });
    expect((await getCountLock())?.denominations).toEqual(short);
  });

  it('cannot lock while a bill is open', async () => {
    await busyShift();
    const o = await newOrder({ order_type: 'takeaway', customer_name: null, table_no: null, created_by: RANI.id });
    await saveOrder({ ...o, items: [item('x', 20000)] });
    await expect(lockCount(exact, RANI.id)).rejects.toThrow('Masih ada 1 open bill');
  });
});

describe('closeShift', () => {
  it('closing needs a note when the count is off', async () => {
    await busyShift();
    await lockCount(short, RANI.id);
    await expect(closeShift(null, RANI.id)).rejects.toThrow('Catatan wajib karena ada selisih');
    await expect(closeShift('Kembalian salah', RANI.id)).resolves.toMatchObject({ variance: -1000, note: 'Kembalian salah' });
  });

  it('closing queues shift.close with the locked count and frees the tablet for a new shift', async () => {
    await busyShift();
    await lockCount(exact, RANI.id);
    const closed = await closeShift(null, RANI.id);
    expect(closed.summary).toMatchObject({ cash_sales: 20000, paid_out: 5000, expected_cash: 215000 });
    const last = (await db.outbox.orderBy('seq').last())!.mutation;
    expect(last).toMatchObject({ type: 'shift.close', denominations: exact, counted_cash: 215000, client_expected: 215000, note: null });
    expect((await getKV('shift'))?.status).toBe('closed');
    expect(await getKV('last_close')).toMatchObject({ counted: 215000 });
    expect(await getCountLock()).toBeNull();
    await expect(openShift(100000, RANI.id)).resolves.toMatchObject({ opening_float: 100000 });
  });

  it("continues from the server's numbers after the tablet's data was wiped", async () => {
    const today = (await import('../codes')).businessDateWIB(new Date());
    await applySnapshot({ ...snapshot, day_numbers: { business_date: today, max_number: 41 } });
    await setCashier(RANI);
    await openShift(100000, RANI.id);
    const o = await newOrder({ order_type: 'takeaway', customer_name: null, table_no: null, created_by: RANI.id });
    expect(o.number).toBe(42);
  });

  it('a second shift the same business day continues the order numbers', async () => {
    await busyShift();
    await cashSale();
    await lockCount({ notes: { '100000': 2, '20000': 1, '10000': 1, '5000': 1 }, coins: 0 }, RANI.id);
    await closeShift(null, RANI.id);
    await openShift(100000, RANI.id);
    const next = await newOrder({ order_type: 'takeaway', customer_name: null, table_no: null, created_by: RANI.id });
    expect(next.number).toBe(3);
    expect(next.code.endsWith('-003')).toBe(true);
  });
});
