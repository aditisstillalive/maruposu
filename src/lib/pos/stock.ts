import { Prisma } from '@prisma/client';
import { consumption, weightedAverage, type Recipe } from './inventory';

type Tx = Prisma.TransactionClient;

export type StockKind = 'sale' | 'purchase' | 'opname' | 'waste';
/** `qty` is signed: negative takes stock out. `total_cost` (rupiah) only for purchases. */
export type StockLine = { ingredient_id: string; qty: number; kind: StockKind; total_cost?: number };

/**
 * The only way stock changes: writes one movement per line (with the balance
 * after it) and updates the ingredient. Purchases move the weighted average;
 * everything else is valued at the current average. Returns the rupiah value
 * of what went out.
 */
export async function postStock(
  tx: Tx,
  input: { outletId: string; actor: string; refType: string; refId: string; note?: string | null; lines: StockLine[] }
): Promise<{ cost: number; ingredientIds: string[] }> {
  const ids = [...new Set(input.lines.map(l => l.ingredient_id))];
  if (!ids.length) return { cost: 0, ingredientIds: [] };
  // Lock the rows so concurrent sales/opnames see each other's balances
  await tx.$queryRaw`SELECT id FROM "Ingredient" WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`;
  const rows = new Map(
    (await tx.ingredient.findMany({ where: { id: { in: ids }, outlet_id: input.outletId } })).map(r => [r.id, { stock: r.stock, avg: r.avg_cost_milli }])
  );

  let outMilli = 0;
  for (const line of input.lines) {
    const row = rows.get(line.ingredient_id);
    if (!row || line.qty === 0) continue;
    let unitCost = row.avg;
    if (line.kind === 'purchase') {
      unitCost = line.qty > 0 ? Math.round(((line.total_cost ?? 0) * 1000) / line.qty) : 0;
      row.avg = weightedAverage(row.stock, row.avg, line.qty, line.total_cost ?? 0);
    } else if (line.qty < 0) {
      outMilli += -line.qty * row.avg;
    }
    row.stock += line.qty;
    await tx.stockMovement.create({
      data: {
        outlet_id: input.outletId, ingredient_id: line.ingredient_id, kind: line.kind, qty: line.qty, unit_cost_milli: unitCost,
        balance: row.stock, ref_type: input.refType, ref_id: input.refId, note: input.note ?? null, actor: input.actor,
      },
    });
  }
  for (const [id, row] of rows) {
    await tx.ingredient.update({ where: { id }, data: { stock: row.stock, avg_cost_milli: row.avg } });
  }
  return { cost: Math.round(outMilli / 1000), ingredientIds: [...rows.keys()] };
}

export async function loadRecipe(tx: Tx, outletId: string): Promise<Recipe> {
  const lines = await tx.recipeLine.findMany({ where: { ingredient: { outlet_id: outletId, is_active: true } } });
  const recipe: Recipe = { product: {}, option: {} };
  for (const l of lines) {
    const key = l.product_id ? recipe.product : recipe.option;
    const id = (l.product_id ?? l.option_id)!;
    (key[id] ??= []).push({ ingredient_id: l.ingredient_id, qty: l.qty });
  }
  return recipe;
}

export type WasteInputLine = { ingredient_id?: string; product_id?: string; option_ids?: string[]; qty: number };

/**
 * Records waste from the tablet or the admin. Products are broken down into
 * their recipe; a product without a recipe is still recorded (cost 0), so an
 * offline tablet never loses the record.
 */
export async function recordWasteTx(
  tx: Tx,
  input: { id: string; outletId: string; source: 'tablet' | 'admin'; reason: string; note: string | null; actor: string; at: Date; lines: WasteInputLine[] }
): Promise<{ cost: number; ingredientIds: string[] }> {
  const recipe = await loadRecipe(tx, input.outletId);
  const productIds = input.lines.flatMap(l => (l.product_id ? [l.product_id] : []));
  const ingredientIds = input.lines.flatMap(l => (l.ingredient_id ? [l.ingredient_id] : []));
  const [products, ingredients] = await Promise.all([
    tx.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } }),
    tx.ingredient.findMany({ where: { id: { in: ingredientIds }, outlet_id: input.outletId }, select: { id: true, name: true } }),
  ]);

  const used = new Map<string, number>();
  for (const l of input.lines) {
    if (l.ingredient_id) used.set(l.ingredient_id, (used.get(l.ingredient_id) ?? 0) + l.qty);
    else if (l.product_id) {
      const c = consumption([{ product_id: l.product_id, options: (l.option_ids ?? []).map(option_id => ({ option_id })), qty: l.qty }], recipe);
      for (const [id, q] of c) used.set(id, (used.get(id) ?? 0) + q);
    }
  }

  await tx.waste.create({
    data: {
      id: input.id, outlet_id: input.outletId, source: input.source, reason: input.reason, note: input.note, actor: input.actor, created_at: input.at,
      lines: {
        create: input.lines.map(l => ({
          ingredient_id: l.ingredient_id ?? null, product_id: l.product_id ?? null, qty: l.qty,
          name: (l.ingredient_id ? ingredients.find(i => i.id === l.ingredient_id)?.name : products.find(p => p.id === l.product_id)?.name) ?? '?',
        })),
      },
    },
  });
  const posted = await postStock(tx, {
    outletId: input.outletId, actor: input.actor, refType: 'waste', refId: input.id, note: input.note,
    lines: [...used].map(([ingredient_id, q]) => ({ ingredient_id, qty: -q, kind: 'waste' as const })),
  });
  if (posted.cost) await tx.waste.update({ where: { id: input.id }, data: { cost: posted.cost } });
  return posted;
}
