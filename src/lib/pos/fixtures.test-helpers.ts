import type { CartLine, LineOption, PromoRule } from './types';

export function opt(name: string, price_delta: number): LineOption {
  return { option_id: `opt-${name}`, group_name: 'Extra', name, price_delta };
}

export function line(partial: Partial<CartLine> & { id: string }): CartLine {
  return {
    product_id: `p-${partial.id}`,
    category_id: 'kopi',
    name: `Produk ${partial.id}`,
    base_price: 0,
    options: [],
    qty: 1,
    note: null,
    ...partial,
  };
}

const basePromo: PromoRule = {
  id: 'promo',
  name: 'Promo',
  code: null,
  kind: 'percent',
  value: 1000,
  max_discount: null,
  scope: 'bill',
  product_ids: [],
  category_ids: [],
  min_spend: 0,
  starts_at: null,
  ends_at: null,
  days: [],
  time_start: null,
  time_end: null,
  quota: null,
  used_count: 0,
  is_active: true,
};

export function billPercent(pct: number): PromoRule {
  return { ...basePromo, kind: 'percent', value: pct * 100 };
}

export function categoryAmount(category: string, value: number): PromoRule {
  return { ...basePromo, kind: 'amount', value, scope: 'category', category_ids: [category] };
}

export const tax10incl = { name: 'PB1', rate_bp: 1000, inclusive: true };
export const tax10excl = { ...tax10incl, inclusive: false };

export const kopi = line({ id: 'a', base_price: 22000, options: [opt('Extra shot', 6000)], qty: 2 }); // 56000
export const croissant = line({ id: 'b', category_id: 'makanan', base_price: 20000, qty: 1 });
