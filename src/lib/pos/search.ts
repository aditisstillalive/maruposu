import type { MenuProduct } from './types';

/** Lowercase, without accents: "Café Brûlée" → "cafe brulee". */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Menu search on the till: every typed word must appear in the name (any
 * order, any category); names that start with the query come first.
 */
export function searchProducts(products: MenuProduct[], query: string): MenuProduct[] {
  const q = fold(query).trim();
  if (!q) return [];
  const words = q.split(/\s+/);
  const hits = products.filter(p => words.every(w => fold(p.name).includes(w)));
  const starts = (p: MenuProduct) => (fold(p.name).startsWith(q) ? 0 : 1);
  return hits.map((p, i) => ({ p, i })).sort((a, b) => starts(a.p) - starts(b.p) || a.i - b.i).map(x => x.p);
}
