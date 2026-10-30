import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Receipt from './Receipt';
import BaristaTicket from './BaristaTicket';
import type { OrderDoc } from '@/lib/pos/types';

const setting = {
  cafe_name: 'Maraca Books & Coffee',
  address: 'Jl. Jalak Harupat 9A, Bogor',
  tax: { name: 'PB1', rate_bp: 1000, inclusive: true },
  receipt_footer: 'Terima kasih! IG @maracacoffee',
};

const order: OrderDoc = {
  id: 'o1', shift_id: 's', code: '261030-A7-014', number: 14, business_date: '2026-10-30', status: 'paid', order_type: 'dine_in',
  customer_name: 'Budi', table_no: '5', created_by: 'e1', paid_by: 'e1', subtotal: 76000, discount: 0, tax: 6909, total: 76000,
  promo_id: null, promo_name: null, payment_method: 'cash', cash_received: 100000, change: 24000, payment_ref: null,
  paid_at: '2026-10-30T07:30:00.000Z', void_reason: null, created_at: '2026-10-30T07:20:00.000Z', refunds: [],
  items: [
    { id: 'a', product_id: 'p', category_id: 'c', name: 'Es Kopi Susu', base_price: 22000, qty: 2, note: 'less ice', sort_order: 0,
      options: [{ option_id: 'x', group_name: 'Extra', name: 'Extra shot', price_delta: 6000 }], discount: 0, paid: 56000, refunded_qty: 0, refunded_amount: 0 },
    { id: 'b', product_id: 'q', category_id: 'c', name: 'Croissant', base_price: 20000, qty: 1, note: null, sort_order: 1, options: [], discount: 0, paid: 20000, refunded_qty: 0, refunded_amount: 0 },
  ],
};

describe('Receipt', () => {
  const html = renderToStaticMarkup(<Receipt order={order} setting={setting} cashierName="Rani" />);

  it('names the cashier and the bill', () => {
    expect(html).toContain('Kasir: Rani');
    expect(html).toContain('261030-A7-014');
    expect(html).toContain('Meja 5');
    expect(html).toContain('Budi');
  });

  it('itemises with options, notes and line totals', () => {
    expect(html).toContain('Extra shot');
    expect(html).toContain('less ice');
    expect(html).toContain('2 x Rp 28.000');
    expect(html).toContain('Rp 56.000');
  });

  it('shows inclusive tax, total, cash and change', () => {
    expect(html).toContain('PB1 10% (termasuk)');
    expect(html).toContain('Rp 6.909');
    expect(html).toMatch(/TOTAL[\s\S]*Rp 76\.000/);
    expect(html).toMatch(/Tunai[\s\S]*Rp 100\.000/);
    expect(html).toMatch(/Kembali[\s\S]*Rp 24\.000/);
    expect(html).toContain('Terima kasih! IG @maracacoffee');
  });

  it('shows the promo line when discounted', () => {
    const promo = renderToStaticMarkup(<Receipt order={{ ...order, discount: 7600, total: 68400, promo_name: 'Diskon 10%' }} setting={setting} cashierName="Rani" />);
    expect(promo).toMatch(/Diskon 10%[\s\S]*-Rp 7\.600/);
  });
});

describe('BaristaTicket', () => {
  const html = renderToStaticMarkup(<BaristaTicket order={order} />);

  it('shows the order number, table and items with options', () => {
    expect(html).toContain('#014');
    expect(html).toContain('Meja 5');
    expect(html).toContain('Es Kopi Susu');
    expect(html).toContain('Extra shot');
    expect(html).toContain('less ice');
  });

  it('has no prices', () => {
    expect(html).not.toContain('Rp');
  });
});
