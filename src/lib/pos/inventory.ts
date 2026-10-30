// Ingredient quantities are whole numbers in the ingredient's own unit (g, ml,
// pcs). Average cost is kept in milli-rupiah per unit so cheap units (Rp 0,25
// per ml) stay exact without floats in the database.

type RecipeLine = { ingredient_id: string; qty: number };

/** Recipes keyed by product id and by option id. */
export type Recipe = { product: Record<string, RecipeLine[]>; option: Record<string, RecipeLine[]> };

type SoldLine = { product_id: string; options: { option_id: string }[]; qty: number };

/** Ingredients used by these lines: product recipe plus each chosen option's, times qty. */
export function consumption(lines: SoldLine[], recipe: Recipe): Map<string, number> {
  const used = new Map<string, number>();
  const add = (r: RecipeLine[] | undefined, times: number) => {
    for (const { ingredient_id, qty } of r ?? []) used.set(ingredient_id, (used.get(ingredient_id) ?? 0) + qty * times);
  };
  for (const l of lines) {
    add(recipe.product[l.product_id], l.qty);
    for (const o of l.options) add(recipe.option[o.option_id], l.qty);
  }
  return used;
}

/** New average cost (milli-rupiah per unit) after buying `qtyIn` units for `totalCost` rupiah. */
export function weightedAverage(stock: number, avgMilli: number, qtyIn: number, totalCost: number): number {
  if (qtyIn <= 0) return avgMilli;
  const onHand = Math.max(stock, 0); // stock below zero has no value to average with
  return Math.round((onHand * avgMilli + totalCost * 1000) / (onHand + qtyIn));
}

/** Rupiah value of the quantities at their average cost. */
export function costOf(qty: Map<string, number>, avgMilli: Record<string, number>): number {
  let milli = 0;
  for (const [id, q] of qty) milli += q * (avgMilli[id] ?? 0);
  return Math.round(milli / 1000);
}

export function toBaseQty(amount: number, unit: 'base' | 'purchase', purchaseSize: number | null): number {
  return Math.round(unit === 'purchase' && purchaseSize ? amount * purchaseSize : amount);
}

export function isLow(stock: number, min: number | null): boolean {
  return min !== null && stock <= min;
}
