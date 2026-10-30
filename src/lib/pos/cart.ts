import type { LineOption, MenuProduct, OrderItemDoc } from './types';

/** Chosen option ids per group id. */
export type Selection = Record<string, string[]>;

export function defaultSelection(product: MenuProduct): Selection {
  return Object.fromEntries(
    product.groups.map(g => [g.id, g.kind === 'variant' ? g.options.filter(o => o.is_default).slice(0, 1).map(o => o.id) : []])
  );
}

/** What's wrong with the selection, in words for the cashier; null when it's fine. */
export function selectionError(product: MenuProduct, sel: Selection): string | null {
  for (const g of product.groups) {
    const n = (sel[g.id] ?? []).length;
    if (g.required && n < Math.max(1, g.min_select)) return `Pilih ${g.name}`;
    if (n > g.max_select) return g.kind === 'variant' ? `Pilih satu ${g.name}` : `${g.name} maksimal ${g.max_select}`;
  }
  return null;
}

export function makeLine(product: MenuProduct, sel: Selection, qty: number, note: string): OrderItemDoc {
  const options: LineOption[] = product.groups.flatMap(g =>
    g.options.filter(o => (sel[g.id] ?? []).includes(o.id)).map(o => ({ option_id: o.id, group_name: g.name, name: o.name, price_delta: o.price_delta }))
  );
  return {
    id: crypto.randomUUID(), product_id: product.id, category_id: product.category_id, name: product.name,
    base_price: product.price, options, qty, note: note.trim() || null,
    sort_order: 0, discount: 0, paid: 0, refunded_qty: 0, refunded_amount: 0,
  };
}

export function selectionFromLine(product: MenuProduct, line: OrderItemDoc): Selection {
  const chosen = new Set(line.options.map(o => o.option_id));
  return Object.fromEntries(product.groups.map(g => [g.id, g.options.filter(o => chosen.has(o.id)).map(o => o.id)]));
}

const sameLine = (a: OrderItemDoc, b: OrderItemDoc) =>
  a.product_id === b.product_id &&
  !a.note && !b.note &&
  a.options.map(o => o.option_id).sort().join() === b.options.map(o => o.option_id).sort().join();

/** Adds a line, folding it into an identical one (same product, options, no note). */
export function mergeLine(items: OrderItemDoc[], line: OrderItemDoc): OrderItemDoc[] {
  const match = items.find(i => sameLine(i, line));
  if (!match) return [...items, line];
  return items.map(i => (i === match ? { ...i, qty: i.qty + line.qty } : i));
}

export function setQty(items: OrderItemDoc[], id: string, qty: number): OrderItemDoc[] {
  return qty <= 0 ? items.filter(i => i.id !== id) : items.map(i => (i.id === id ? { ...i, qty } : i));
}
