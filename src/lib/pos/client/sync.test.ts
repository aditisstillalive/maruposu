import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { addCashMove, newOrder, openShift, payOrder, saveOrder, setCashier } from './actions';
import { applySnapshot, syncOnce } from './sync';
import type { OrderDoc, Snapshot } from '../types';

const RANI = { id: 'emp-rani', name: 'Rani', photo_url: null };

function snapshot(extra: Partial<Snapshot> = {}): Snapshot {
  return {
    device_tag: 'A7',
    setting: { cafe_name: 'Maraca', address: null, tax: { name: 'PB1', rate_bp: 1000, inclusive: true }, receipt_footer: null, receipt_header: null, receipt_logo: null },
    employees: [RANI],
    categories: [{ id: 'kopi', name: 'Kopi' }],
    products: [],
    promos: [],
    shift: null,
    orders: [],
    cash_moves: [],
    fetched_at: '2026-10-30T02:00:00.000Z',
    day_numbers: { business_date: '2000-01-01', max_number: 0 },
    ingredients: [],
    low_stock: { count: 0, names: [] },
    ...extra,
  };
}

type Call = { url: string; body?: unknown };

/** fetch stand-in: answers /api/pos/sync with `sync` and the snapshot route with `snap`. */
function fakeFetch(sync: (body: { mutations: { id: string }[] }) => Response | Promise<Response>, snap: () => Response = () => json(snapshot())) {
  const calls: Call[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    if (url.endsWith('/api/pos/sync')) return sync(body);
    return snap();
  }) as typeof fetch;
  return { impl, calls };
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const allApplied = (body: { mutations: { id: string }[] }) => json({ results: body.mutations.map(m => ({ id: m.id, status: 'applied' })) });

async function ready() {
  await applySnapshot(snapshot());
  await setCashier(RANI);
  await openShift(200000, RANI.id);
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('local writes', () => {
  it('queues a mutation with every local write', async () => {
    await ready();
    await addCashMove('paid_out', 20000, 'Beli galon', RANI.id);
    const types = (await db.outbox.orderBy('seq').toArray()).map(e => e.mutation.type);
    expect(types).toEqual(['shift.open', 'cash.move']);
    expect(await db.cash_moves.count()).toBe(1);
  });

  it('numbers orders per business day with the device tag', async () => {
    await ready();
    const a = await newOrder({ order_type: 'dine_in', customer_name: 'Budi', table_no: '5', created_by: RANI.id });
    expect(a.code).toMatch(/^\d{6}-A7-001$/);
    await saveOrder({ ...a, items: [item('l1', 22000)] });
    const b = await newOrder({ order_type: 'takeaway', customer_name: null, table_no: null, created_by: RANI.id });
    expect(b.number).toBe(2);
  });

  it('pays with totals computed on the tablet', async () => {
    await ready();
    const o = await newOrder({ order_type: 'takeaway', customer_name: null, table_no: null, created_by: RANI.id });
    await saveOrder({ ...o, items: [item('l1', 22000, 2), item('l2', 20000)] });
    const paid = await payOrder(o.id, { method: 'cash', cash_received: 100000, payment_ref: null, employee_id: RANI.id, promo: null });
    expect(paid).toMatchObject({ status: 'paid', total: 64000, change: 36000, tax: 5818 });
    const pay = (await db.outbox.toArray()).find(e => e.mutation.type === 'order.pay')!.mutation;
    expect(pay).toMatchObject({ client_totals: { subtotal: 64000, discount: 0, tax: 5818, total: 64000 }, cash_received: 100000 });
  });

  it('refuses to pay with too little cash', async () => {
    await ready();
    const o = await newOrder({ order_type: 'takeaway', customer_name: null, table_no: null, created_by: RANI.id });
    await saveOrder({ ...o, items: [item('l1', 22000)] });
    await expect(payOrder(o.id, { method: 'cash', cash_received: 10000, payment_ref: null, employee_id: RANI.id, promo: null })).rejects.toThrow('Uang diterima kurang dari total');
  });
});

describe('syncOnce', () => {
  it('sends the outbox in order and empties it', async () => {
    await ready();
    await addCashMove('paid_in', 50000, 'Modal Bu Risya', RANI.id);
    const f = fakeFetch(allApplied);
    const state = await syncOnce(f.impl);
    expect(state).toMatchObject({ status: 'idle', pending: 0, rejected: 0 });
    expect((f.calls[0].body as { mutations: { type: string }[] }).mutations.map(m => m.type)).toEqual(['shift.open', 'cash.move']);
    expect(await db.outbox.count()).toBe(0);
  });

  it('keeps the outbox when the device session expired', async () => {
    await ready();
    const locked = await syncOnce(fakeFetch(() => json({ error: 'Device locked' }, 401)).impl);
    expect(locked).toMatchObject({ status: 'locked', pending: 1 });
    expect(await db.outbox.count()).toBe(1);

    const after = await syncOnce(fakeFetch(allApplied).impl);
    expect(after).toMatchObject({ status: 'idle', pending: 0 });
  });

  it('network failure leaves everything queued', async () => {
    await ready();
    const state = await syncOnce((async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch);
    expect(state).toMatchObject({ status: 'offline', pending: 1 });
    expect(await db.outbox.count()).toBe(1);
  });

  it('a server error keeps the outbox for the next try', async () => {
    await ready();
    const state = await syncOnce(fakeFetch(() => json({ error: 'down' }, 503)).impl);
    expect(state).toMatchObject({ status: 'error', pending: 1 });
  });

  it('rejected mutations are dropped from the outbox and counted', async () => {
    await ready();
    const f = fakeFetch(body => json({ results: body.mutations.map(m => ({ id: m.id, status: 'rejected', error: 'Masih ada shift lain yang terbuka' })) }));
    const state = await syncOnce(f.impl);
    expect(state).toMatchObject({ pending: 0, rejected: 1 });
    expect(await db.outbox.count()).toBe(0);
    const [kept] = (await db.kv.get('rejected'))!.value as { mutation: { type: string; shift_id: string } }[];
    expect(kept.mutation).toMatchObject({ type: 'shift.open', opening_float: 200000 });
  });

  it('keeps every rejected mutation, however many (e.g. a whole offline afternoon after an admin close)', async () => {
    await ready();
    for (let i = 0; i < 60; i++) await addCashMove('paid_in', 1000, `#${i}`, RANI.id);
    const f = fakeFetch(body => json({ results: body.mutations.map(m => ({ id: m.id, status: 'rejected', error: 'Shift sudah ditutup' })) }));
    const state = await syncOnce(f.impl);
    expect(state.rejected).toBe(61);
    const kept = (await db.kv.get('rejected'))!.value as { mutation: { note?: string } }[];
    expect(kept.filter(k => k.mutation.note === '#0')).toHaveLength(1);
  });

  it('pulls the snapshot once the outbox is empty', async () => {
    await ready();
    const serverOrder = order('srv-1', 'paid');
    const f = fakeFetch(allApplied, () => json(snapshot({ orders: [serverOrder] })));
    await syncOnce(f.impl);
    expect(f.calls.map(c => c.url.replace(/^.*\/api/, '/api'))).toEqual(['/api/pos/sync', '/api/pos/snapshot']);
    expect(await db.orders.get('srv-1')).toMatchObject({ status: 'paid' });
  });
  it('sends the version it has and keeps its data when the server says unchanged', async () => {
    await applySnapshot(snapshot({ version: 'v1', employees: [RANI] }));
    const { impl, calls } = fakeFetch(allApplied, () => json({ unchanged: true, version: 'v1' }));
    const state = await syncOnce(impl);
    expect(calls.at(-1)!.url).toBe('/api/pos/snapshot?v=v1');
    expect(state.status).toBe('idle');
    expect(((await db.kv.get('snapshot'))?.value as Snapshot).employees).toEqual([RANI]);
  });

  it('asks without a version before the first snapshot', async () => {
    const { impl, calls } = fakeFetch(allApplied, () => json(snapshot({ version: 'v2' })));
    await syncOnce(impl);
    expect(calls.at(-1)!.url).toBe('/api/pos/snapshot');
  });
});

describe('applySnapshot', () => {
  it('snapshot never overwrites an order with pending changes', async () => {
    await ready();
    const o = await newOrder({ order_type: 'dine_in', customer_name: 'Budi', table_no: '5', created_by: RANI.id });
    await saveOrder({ ...o, items: [item('l1', 22000, 3)] });
    await applySnapshot(snapshot({ orders: [{ ...o, items: [item('l1', 22000, 1)] }] }));
    expect((await db.orders.get(o.id))!.items[0].qty).toBe(3);
  });

  it('remembers that the server closed the open shift (an admin close) so the cashier is told', async () => {
    await ready();
    await syncOnce(fakeFetch(allApplied, () => json(snapshot({ shift: null }))).impl);
    expect(await db.kv.get('shift')).toMatchObject({ value: null });
    expect((await db.kv.get('closed_remotely'))?.value).toMatchObject({ business_date: expect.any(String) });
  });

  it('a shift the tablet closed itself is not reported as closed remotely', async () => {
    await applySnapshot(snapshot());
    expect(await db.kv.get('closed_remotely')).toBeUndefined();
  });

  it('drops local orders the server no longer has once nothing is pending', async () => {
    await applySnapshot(snapshot({ orders: [order('old', 'paid')] }));
    await applySnapshot(snapshot({ orders: [] }));
    expect(await db.orders.count()).toBe(0);
  });
});

function item(id: string, price: number, qty = 1): OrderDoc['items'][number] {
  return { id, product_id: `p-${id}`, category_id: 'kopi', name: `Item ${id}`, base_price: price, options: [], qty, note: null, sort_order: 0, discount: 0, paid: 0, refunded_qty: 0, refunded_amount: 0 };
}

function order(id: string, status: OrderDoc['status']): OrderDoc {
  return {
    id, shift_id: 's', code: '261030-A7-009', number: 9, business_date: '2026-10-30', status, order_type: 'takeaway',
    customer_name: null, table_no: null, created_by: RANI.id, paid_by: null, subtotal: 0, discount: 0, tax: 0, total: 0,
    promo_id: null, promo_name: null, payment_method: null, cash_received: null, change: null, payment_ref: null,
    paid_at: null, void_reason: null, created_at: '2026-10-30T02:00:00.000Z', items: [item('x', 1000)], refunds: [],
  };
}
