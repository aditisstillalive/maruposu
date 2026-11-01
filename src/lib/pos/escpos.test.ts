import { describe, expect, it } from 'vitest';
import { encode, layout, receiptLines, shiftReportLines, ticketLines } from './escpos';
import type { OrderDoc } from './types';

const setting = {
  cafe_name: 'Maraca Books & Coffee',
  address: 'Jl. Jalak Harupat 9A, Bogor',
  tax: { name: 'PB1', rate_bp: 1000, inclusive: true },
  receipt_footer: 'Terima kasih! Sampai jumpa lagi di Maraca, IG @maracacoffee',
  receipt_header: null,
  receipt_logo: null,
};

const order: OrderDoc = {
  id: 'o1', shift_id: 's', code: '261030-A7-014', number: 14, business_date: '2026-10-30', status: 'paid', order_type: 'dine_in',
  customer_name: 'Budi', table_no: '5', created_by: 'e1', paid_by: 'e1', subtotal: 76000, discount: 0, tax: 6909, total: 76000,
  promo_id: null, promo_name: null, payment_method: 'cash', cash_received: 100000, change: 24000, payment_ref: null,
  paid_at: '2026-10-30T07:30:00.000Z', void_reason: null, created_at: '2026-10-30T07:20:00.000Z', refunds: [],
  items: [
    { id: 'a', product_id: 'p', category_id: 'c', name: 'Es Kopi Susu', base_price: 22000, qty: 2, note: 'less ice', sort_order: 0,
      options: [{ option_id: 'x', group_name: 'Extra', name: 'Extra shot', price_delta: 6000 }], discount: 0, paid: 56000, refunded_qty: 0, refunded_amount: 0 },
    { id: 'b', product_id: 'q', category_id: 'c', name: 'Crème brûlée dengan nama yang sangat panjang sekali', base_price: 20000, qty: 1, note: null, sort_order: 1, options: [], discount: 0, paid: 20000, refunded_qty: 0, refunded_amount: 0 },
  ],
};

const text = (lines: ReturnType<typeof layout>) => lines.map(l => l.text);
/** A left/right row padded to the paper width. */
const row = (left: string, right: string, width = 32) => left + ' '.repeat(width - left.length - right.length) + right;

describe('receipt on 58 mm paper (32 columns)', () => {
  const out = layout(receiptLines(order, setting, 'Rani'), 58);
  const t = text(out);

  it('never runs past the paper width', () => {
    expect(t.every(l => l.length <= 32)).toBe(true);
  });

  it('heads with the café, the bill and the cashier', () => {
    expect(out[0]).toMatchObject({ text: 'Maraca Books & Coffee', align: 'center', bold: true });
    expect(t).toContain('No: 261030-A7-014');
    expect(t).toContain('Kasir: Rani');
    expect(t).toContain('Dine-in - Meja 5 - Budi');
  });

  it('lists items with options and notes, amounts on the right', () => {
    expect(t).toContain('Es Kopi Susu');
    expect(t).toContain('  Extra shot');
    expect(t).toContain('  * less ice');
    expect(t).toContain(row('  2 x Rp 28.000', 'Rp 56.000'));
  });

  it('wraps long names and writes accents as plain letters', () => {
    expect(t).toContain('Creme brulee dengan nama yang');
    expect(t).toContain('sangat panjang sekali');
  });

  it('ends with total, tax, payment, change and the footer', () => {
    expect(out.find(l => l.text.startsWith('TOTAL'))).toMatchObject({ text: row('TOTAL', 'Rp 76.000'), bold: true });
    expect(t).toContain(row('PB1 10% (termasuk)', 'Rp 6.909'));
    expect(t).toContain(row('Tunai', 'Rp 100.000'));
    expect(t).toContain(row('Kembali', 'Rp 24.000'));
    expect(t.slice(-2)).toEqual(['Terima kasih! Sampai jumpa lagi', 'di Maraca, IG @maracacoffee']);
  });
});

describe('receipt on 80 mm paper (48 columns)', () => {
  it('uses the full width', () => {
    const t = text(layout(receiptLines(order, setting, 'Rani'), 80));
    expect(t.every(l => l.length <= 48)).toBe(true);
    expect(t.find(l => l.startsWith('TOTAL'))).toHaveLength(48);
  });
});

describe('barista ticket', () => {
  const out = layout(ticketLines(order), 58);

  it('shows the order number large and no prices', () => {
    expect(out[0]).toMatchObject({ text: '#014', big: true, align: 'center' });
    expect(text(out).join('\n')).not.toContain('Rp');
    expect(text(out)).toContain('2 x Es Kopi Susu');
  });
});

describe('shift report', () => {
  const closed = {
    shift: { id: 's', business_date: '2026-10-30', opening_float: 200000, opened_by: 'e1', opened_at: '2026-10-30T01:00:00.000Z', status: 'closed' as const },
    summary: {
      opening_float: 200000, transactions: 2, cash_sales: 20000, edc_sales: 0, qris_sales: 20000, gross_sales: 40000, discounts: 0, tax: 3636,
      voids: 1, refunds_cash: 0, refunds_cashless: 0, paid_in: 0, paid_out: 5000, expected_cash: 215000,
    },
    denominations: { notes: { '100000': 2, '10000': 1 }, coins: 4000 },
    counted: 214000, expected: 215000, variance: -1000, note: 'Kembalian salah', closed_by: 'e1', closed_at: '2026-10-30T10:00:00.000Z', seen: false,
  };
  const t = text(layout(shiftReportLines(closed, setting, [{ id: 'e1', name: 'Rani', photo_url: null }]), 58));

  it('has the expected cash, the count and the variance', () => {
    expect(t).toContain(row('Saldo seharusnya', 'Rp 215.000'));
    expect(t).toContain(row('100.000 x 2', 'Rp 200.000'));
    expect(t).toContain(row('Selisih', 'Kurang Rp 1.000'));
    expect(t).toContain('Catatan: Kembalian salah');
  });
});

describe('encode', () => {
  const bytes = encode(receiptLines(order, setting, 'Rani'), 58);

  it('resets the printer first and feeds and cuts at the end', () => {
    expect([...bytes.slice(0, 2)]).toEqual([0x1b, 0x40]);
    expect([...bytes.slice(-4)]).toEqual([0x1d, 0x56, 0x42, 0x00]);
  });

  it('sends only plain ASCII text', () => {
    expect([...bytes].every(b => b < 0x80)).toBe(true);
  });

  it('turns bold on for the total and off again', () => {
    const s = String.fromCharCode(...bytes);
    expect(s).toContain('\x1bE\x01TOTAL');
    expect(s.indexOf('\x1bE\x00', s.indexOf('TOTAL'))).toBeGreaterThan(0);
  });

  it('prints the ticket number double size', () => {
    expect(String.fromCharCode(...encode(ticketLines(order), 58))).toContain('\x1d!\x11#014');
  });
});

describe('header, multi-line footer and logo', () => {
  const logo = { width: 16, height: 2, bits: Buffer.from([0xff, 0x00, 0x0f, 0xf0]).toString('base64'), preview: 'data:image/png;base64,AA==' };
  const withExtras = { ...setting, receipt_header: 'Wifi: maraca\nPassword: kopi2016', receipt_footer: 'Terima kasih!\n\nIG @maracacoffee', receipt_logo: logo };

  it('keeps the line breaks of the footer and header instead of printing ?', () => {
    const t = text(layout(receiptLines(order, withExtras, 'Rani'), 58));
    expect(t.join('\n')).not.toContain('?');
    expect(t.slice(-3)).toEqual(['Terima kasih!', '', 'IG @maracacoffee']);
    expect(t.indexOf('Wifi: maraca')).toBe(t.indexOf('Jl. Jalak Harupat 9A, Bogor') + 1);
    expect(t).toContain('Password: kopi2016');
  });

  it('prints the logo first as an ESC/POS raster image, centred', () => {
    const lines = receiptLines(order, withExtras, 'Rani');
    expect(lines[0]).toMatchObject({ image: { width: 16, height: 2 } });
    const s = String.fromCharCode(...encode(lines, 58));
    // reset, centre, GS v 0: 2 bytes per row, 2 rows, then the bits
    expect(s.startsWith('\x1b@\x1ba\x01\x1dv0\x00\x02\x00\x02\x00\xff\x00\x0f\xf0')).toBe(true);
  });

  it('sends tall logos in bands the printer buffer can take', () => {
    const tall = { width: 8, height: 100, bits: Buffer.alloc(100, 0xaa).toString('base64'), preview: '' };
    const s = String.fromCharCode(...encode(receiptLines(order, { ...setting, receipt_logo: tall }, 'Rani'), 58));
    expect(s.split('\x1dv0').length - 1).toBe(2); // 64 + 36 rows
  });
});
