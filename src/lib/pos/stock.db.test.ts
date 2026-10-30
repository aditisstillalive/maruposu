import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { applyMutations } from './apply';
import { postStock, saveOpnameTx } from './stock';
import { buildSnapshot } from './snapshot';

const T0 = '2026-10-30T02:00:00.000Z';
let outletId = '';
let rani = '';
let cat = '';
let kopi = '';
let croissant = '';
let ice = '';
let shot = '';
const ing: Record<string, string> = {};

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "WasteLine","Waste","StockOpnameLine","StockOpname","PurchaseItem","Purchase","StockMovement","RecipeLine","Ingredient","PosMutation","RefundItem","Refund","CashMovement","OrderItemOption","OrderItem","Order","Shift","Promo","ProductOptionGroup","Option","OptionGroup","Product","Category","Employee","Setting","AuditLog","Outlet" CASCADE'
  );
  outletId = (await prisma.outlet.create({ data: { name: 'M', setting: { create: { cafe_name: 'M', master_pin_hash: 'x' } } } })).id;
  rani = (await prisma.employee.create({ data: { outlet_id: outletId, name: 'Rani' } })).id;
  cat = (await prisma.category.create({ data: { outlet_id: outletId, name: 'Kopi' } })).id;
  kopi = (await prisma.product.create({ data: { category_id: cat, name: 'Es Kopi Susu', price: 22000 } })).id;
  croissant = (await prisma.product.create({ data: { category_id: cat, name: 'Croissant', price: 20000 } })).id;
  const g = await prisma.optionGroup.create({ data: { outlet_id: outletId, name: 'Extra', kind: 'addon', required: false, max_select: 3,
    options: { create: [{ name: 'Ice', sort_order: 0 }, { name: 'Extra shot', price_delta: 6000, sort_order: 1 }] } }, include: { options: true } });
  ice = g.options.find(o => o.name === 'Ice')!.id;
  shot = g.options.find(o => o.name === 'Extra shot')!.id;
  // stock & average cost (milli-rupiah per unit)
  for (const [name, unit, stock, avg, min] of [['kopi', 'g', 1000, 250_000, 100], ['susu', 'ml', 2000, 15_000, 1500], ['es', 'g', 5000, 500, null]] as const) {
    ing[name] = (await prisma.ingredient.create({ data: { outlet_id: outletId, name, unit, stock, avg_cost_milli: avg, min_stock: min } })).id;
  }
  await prisma.recipeLine.createMany({ data: [
    { product_id: kopi, ingredient_id: ing.kopi, qty: 18 }, { product_id: kopi, ingredient_id: ing.susu, qty: 150 },
    { option_id: ice, ingredient_id: ing.es, qty: 150 }, { option_id: shot, ingredient_id: ing.kopi, qty: 9 },
  ] });
});

const m = (type: string, payload: Record<string, unknown>, id = randomUUID()) => ({ id, type, created_at: T0, ...payload });
let seq = 0;

async function sell(items: { product: string; name: string; price: number; options?: { id: string; name: string; delta: number }[]; qty: number }[], total: number, payId = randomUUID()) {
  const shift = await prisma.shift.findFirst({ where: { status: 'open' } });
  const shiftId = shift?.id ?? randomUUID();
  const orderId = randomUUID();
  seq += 1;
  const r = await applyMutations('d', [
    ...(shift ? [] : [m('shift.open', { shift_id: shiftId, opening_float: 0, employee_id: rani, business_date: '2026-10-30' })]),
    m('order.save', { order: { id: orderId, shift_id: shiftId, code: `261030-A7-${String(seq).padStart(3, '0')}`, number: seq, business_date: '2026-10-30',
      order_type: 'takeaway', customer_name: null, table_no: null, created_by: rani, created_at: T0,
      items: items.map((it, i) => ({ id: randomUUID(), product_id: it.product, category_id: cat, name: it.name, base_price: it.price, qty: it.qty, note: null, sort_order: i,
        options: (it.options ?? []).map(o => ({ option_id: o.id, group_name: 'Extra', name: o.name, price_delta: o.delta })) })) } }),
    m('order.pay', { order_id: orderId, promo_id: null, method: 'qris', cash_received: null, payment_ref: null, employee_id: rani,
      client_totals: { subtotal: total, discount: 0, tax: Math.round(total / 11), total } }, payId),
  ]);
  expect(r.results.every(x => x.status === 'applied')).toBe(true);
  return { orderId, payId, pay: r };
}

const stock = async (name: string) => (await prisma.ingredient.findUniqueOrThrow({ where: { id: ing[name] } })).stock;

describe('stock on payment', () => {
  it('paying a bill deducts its recipe and stores the line cost', async () => {
    const { orderId } = await sell([{ product: kopi, name: 'Es Kopi Susu', price: 22000, qty: 2, options: [{ id: ice, name: 'Ice', delta: 0 }, { id: shot, name: 'Extra shot', delta: 6000 }] }], 56000);
    expect([await stock('kopi'), await stock('susu'), await stock('es')]).toEqual([1000 - 54, 2000 - 300, 5000 - 300]);
    const moves = await prisma.stockMovement.findMany({ where: { ref_type: 'order', ref_id: orderId }, orderBy: { ingredient_id: 'asc' } });
    expect(moves).toHaveLength(3);
    expect(moves.find(mv => mv.ingredient_id === ing.susu)).toMatchObject({ kind: 'sale', qty: -300, balance: 1700, unit_cost_milli: 15_000 });
    // 54 g × Rp 250 + 300 ml × Rp 15 + 300 g × Rp 0,5 = 13 500 + 4 500 + 150
    expect((await prisma.orderItem.findFirstOrThrow({ where: { order_id: orderId } })).cogs).toBe(18_150);
  });

  it("a resent pay doesn't deduct twice", async () => {
    const { payId, orderId } = await sell([{ product: kopi, name: 'Es Kopi Susu', price: 22000, qty: 1 }], 22000);
    const again = await applyMutations('d', [m('order.pay', { order_id: orderId, promo_id: null, method: 'qris', cash_received: null, payment_ref: null, employee_id: rani,
      client_totals: { subtotal: 22000, discount: 0, tax: 2000, total: 22000 } }, payId)]);
    expect(again.results[0].status).toBe('duplicate');
    expect(await stock('susu')).toBe(1850);
  });

  it('a product without a recipe sells with zero cost', async () => {
    const { orderId } = await sell([{ product: croissant, name: 'Croissant', price: 20000, qty: 1 }], 20000);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({ status: 'paid' });
    expect((await prisma.orderItem.findFirstOrThrow({ where: { order_id: orderId } })).cogs).toBe(0);
    expect(await prisma.stockMovement.count()).toBe(0);
  });

  it('stock may go negative', async () => {
    await prisma.ingredient.update({ where: { id: ing.susu }, data: { stock: 100 } });
    await sell([{ product: kopi, name: 'Es Kopi Susu', price: 22000, qty: 1 }], 22000);
    expect(await stock('susu')).toBe(-50);
  });
});

describe('waste.record', () => {
  it('waste of a product deducts its recipe; waste of an ingredient deducts it', async () => {
    const wasteId = randomUUID();
    const r = await applyMutations('d', [m('waste.record', { waste_id: wasteId, reason: 'tumpah', note: null, employee_id: rani, lines: [
      { product_id: kopi, option_ids: [ice], qty: 1 },
      { ingredient_id: ing.susu, qty: 200 },
    ] })]);
    expect(r.results[0].status).toBe('applied');
    expect([await stock('kopi'), await stock('susu'), await stock('es')]).toEqual([982, 1650, 4850]);
    const w = await prisma.waste.findUniqueOrThrow({ where: { id: wasteId }, include: { lines: true } });
    expect(w).toMatchObject({ source: 'tablet', reason: 'tumpah', actor: `employee:${rani}` });
    // 18×250 + 350×15 + 150×0,5 = 4 500 + 5 250 + 75
    expect(w.cost).toBe(9825);
    expect(w.lines.map(l => l.name).sort()).toEqual(['Es Kopi Susu', 'susu']);
  });

  it('waste of a product without a recipe is kept with zero cost', async () => {
    const r = await applyMutations('d', [m('waste.record', { waste_id: randomUUID(), reason: 'rusak', note: 'jatuh', employee_id: rani, lines: [{ product_id: croissant, qty: 2 }] })]);
    expect(r.results[0].status).toBe('applied');
    expect((await prisma.waste.findFirstOrThrow()).cost).toBe(0);
    expect(await prisma.stockMovement.count()).toBe(0);
  });
});

describe('postStock', () => {
  it('purchase updates the weighted average', async () => {
    await prisma.$transaction(tx => postStock(tx, { outletId, actor: 'admin', refType: 'purchase', refId: 'p1', lines: [{ ingredient_id: ing.susu, qty: 2000, kind: 'purchase', total_cost: 36000 }] }));
    // (2000 × 15 + 36 000 × 1000 / ...) → (2000×15 000 + 36 000 000) / 4000 = 16 500
    expect(await prisma.ingredient.findUniqueOrThrow({ where: { id: ing.susu } })).toMatchObject({ stock: 4000, avg_cost_milli: 16_500 });
    expect(await prisma.stockMovement.findFirstOrThrow()).toMatchObject({ kind: 'purchase', qty: 2000, balance: 4000, unit_cost_milli: 18_000 });
  });
});

describe('snapshot inventory', () => {
  it('lists active ingredients and those running low', async () => {
    await prisma.ingredient.update({ where: { id: ing.susu }, data: { stock: 1000 } });
    const s = await buildSnapshot('d');
    expect(s.ingredients.map(i => i.name).sort()).toEqual(['es', 'kopi', 'susu']);
    expect(s.low_stock).toEqual({ count: 1, names: ['susu'] });
  });
});

describe('saveOpnameTx', () => {
  it('opname uses the stock at save time', async () => {
    await prisma.ingredient.update({ where: { id: ing.susu }, data: { stock: 1000 } });
    // the screen showed 1 000; a sale of 100 lands before the save
    await prisma.$transaction(tx => postStock(tx, { outletId, actor: 'x', refType: 'order', refId: 'o', lines: [{ ingredient_id: ing.susu, qty: -100, kind: 'sale' }] }));
    const r = await prisma.$transaction(tx => saveOpnameTx(tx, { outletId, actor: 'admin', note: null, lines: [{ ingredient_id: ing.susu, counted: 900 }, { ingredient_id: ing.es, counted: 4800 }] }));
    const lines = await prisma.stockOpnameLine.findMany({ where: { opname_id: r.id } });
    expect(lines.find(l => l.ingredient_id === ing.susu)).toMatchObject({ system_qty: 900, counted_qty: 900, diff: 0 });
    expect(lines.find(l => l.ingredient_id === ing.es)).toMatchObject({ system_qty: 5000, counted_qty: 4800, diff: -200 });
    expect(await prisma.stockMovement.count({ where: { ref_type: 'opname' } })).toBe(1);
    expect(await stock('es')).toBe(4800);
  });
});
