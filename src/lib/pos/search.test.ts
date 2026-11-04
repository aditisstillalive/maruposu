import { describe, expect, it } from 'vitest';
import { searchProducts } from './search';
import type { MenuProduct } from './types';

const p = (id: string, name: string, category_id = 'kopi'): MenuProduct => ({ id, category_id, name, price: 1, photo_url: null, is_sold_out: false, groups: [] });
const menu = [p('1', 'Kopi Pagi'), p('2', 'Dark Mochaccino'), p('3', 'Café Latte'), p('4', 'Ubi Cilembu Brûlée', 'makanan'), p('5', 'Cold Brew'), p('6', 'Es Kopi Susu')];

describe('searchProducts', () => {
  it('finds by any part of the name, ignoring case and accents, across categories', () => {
    expect(searchProducts(menu, 'moch').map(x => x.id)).toEqual(['2']);
    expect(searchProducts(menu, 'CAFE').map(x => x.id)).toEqual(['3']);
    expect(searchProducts(menu, 'brulee').map(x => x.id)).toEqual(['4']);
  });

  it('needs every typed word, in any order', () => {
    expect(searchProducts(menu, 'pagi kopi').map(x => x.id)).toEqual(['1']);
    expect(searchProducts(menu, 'susu es').map(x => x.id)).toEqual(['6']);
    expect(searchProducts(menu, 'kopi x')).toEqual([]);
  });

  it('puts names that start with the query first', () => {
    expect(searchProducts(menu, 'kopi').map(x => x.id)).toEqual(['1', '6']);
    expect(searchProducts(menu, 'susu').map(x => x.id)).toEqual(['6']);
  });

  it('returns nothing for an empty query', () => {
    expect(searchProducts(menu, '   ')).toEqual([]);
  });
});
