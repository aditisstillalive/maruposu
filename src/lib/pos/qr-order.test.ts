import { describe, expect, it } from 'vitest';
import { linesFromCart, QrOrderError, qrOrderSchema } from './qr-order';
import type { MenuProduct } from './types';

const menu: MenuProduct[] = [
  {
    id: 'eks', category_id: 'kopi', name: 'Es Kopi Susu', price: 22000, photo_url: null, is_sold_out: false,
    groups: [
      { id: 'suhu', name: 'Suhu', kind: 'variant', required: true, min_select: 1, max_select: 1, options: [
        { id: 'ice', name: 'Ice', price_delta: 0, is_default: true }, { id: 'hot', name: 'Hot', price_delta: 0, is_default: false },
      ] },
      { id: 'extra', name: 'Extra', kind: 'addon', required: false, min_select: 0, max_select: 2, options: [
        { id: 'shot', name: 'Extra shot', price_delta: 6000, is_default: false }, { id: 'oat', name: 'Oat milk', price_delta: 8000, is_default: false },
        { id: 'syrup', name: 'Syrup', price_delta: 3000, is_default: false },
      ] },
    ],
  },
  { id: 'cro', category_id: 'makanan', name: 'Croissant', price: 20000, photo_url: null, is_sold_out: true, groups: [] },
];

describe('linesFromCart', () => {
  it('prices lines from the menu, not from what the phone sent', () => {
    const [line] = linesFromCart(menu, [{ product_id: 'eks', option_ids: ['hot', 'shot'], qty: 2, note: ' less sugar ' }]);
    expect(line).toMatchObject({ product_id: 'eks', category_id: 'kopi', name: 'Es Kopi Susu', base_price: 22000, qty: 2, note: 'less sugar' });
    expect(line.options).toEqual([
      { option_id: 'hot', group_name: 'Suhu', name: 'Hot', price_delta: 0 },
      { option_id: 'shot', group_name: 'Extra', name: 'Extra shot', price_delta: 6000 },
    ]);
  });

  it('refuses sold-out and unknown products', () => {
    expect(() => linesFromCart(menu, [{ product_id: 'cro', option_ids: [], qty: 1 }])).toThrow('Croissant sedang habis');
    expect(() => linesFromCart(menu, [{ product_id: 'gone', option_ids: [], qty: 1 }])).toThrow(QrOrderError);
  });

  it('applies the same option rules as the till', () => {
    expect(() => linesFromCart(menu, [{ product_id: 'eks', option_ids: [], qty: 1 }])).toThrow('Pilih Suhu');
    expect(() => linesFromCart(menu, [{ product_id: 'eks', option_ids: ['ice', 'hot'], qty: 1 }])).toThrow('Pilih satu Suhu');
    expect(() => linesFromCart(menu, [{ product_id: 'eks', option_ids: ['ice', 'shot', 'oat', 'syrup'], qty: 1 }])).toThrow('Extra maksimal 2');
    expect(() => linesFromCart(menu, [{ product_id: 'eks', option_ids: ['ice', 'nope'], qty: 1 }])).toThrow('Pilihan tidak tersedia');
  });
});

describe('qrOrderSchema', () => {
  const item = { product_id: 'eks', option_ids: ['ice'], qty: 1 };
  it('limits how much one submit can order', () => {
    expect(qrOrderSchema.safeParse({ items: [item] }).success).toBe(true);
    expect(qrOrderSchema.safeParse({ items: [] }).success).toBe(false);
    expect(qrOrderSchema.safeParse({ items: [{ ...item, qty: 21 }] }).success).toBe(false);
    expect(qrOrderSchema.safeParse({ items: Array(31).fill(item) }).success).toBe(false);
    expect(qrOrderSchema.safeParse({ items: [item], customer_name: 'x'.repeat(41) }).success).toBe(false);
  });
});
