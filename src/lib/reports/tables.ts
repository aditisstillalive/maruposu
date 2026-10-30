// Column layouts for each report's CSV. Pages show the same numbers from the
// same aggregate functions.
import { byCashier, byCategory, byDay, byPayment, byProduct, byPromo, taxReport, voidsAndRefunds } from './aggregate';
import type { ReportData } from './types';

export const REPORTS = ['transactions', 'daily', 'payments', 'products', 'categories', 'cashiers', 'promos', 'tax', 'voids'] as const;
export type ReportName = (typeof REPORTS)[number];

export const METHOD_LABEL: Record<string, string> = { cash: 'Tunai', edc: 'EDC', qris: 'QRIS' };
const STATUS: Record<string, string> = { paid: 'Lunas', refunded: 'Refund', void: 'Batal', open: 'Open' };
// Decimal comma: the `;`-separated file is meant for Indonesian Excel
const pct = (x: number) => String(Math.round(x * 1000) / 10).replace('.', ',');
const timeWIB = (iso: string | null) => (iso ? new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 16) : '');

type Table = { headers: string[]; rows: (string | number | null)[][] };

export function reportTable(name: ReportName, d: ReportData): Table {
  const who = (id: string | null) => (id ? d.employees[id] ?? id : '');
  switch (name) {
    case 'transactions':
      return {
        headers: ['Hari bisnis', 'Waktu bayar', 'No. bill', 'Status', 'Customer', 'Kasir', 'Metode', 'Item', 'Subtotal', 'Diskon', 'Promo', 'Pajak', 'Total', 'Refund', 'HPP'],
        rows: d.orders.map(o => [
          o.business_date, timeWIB(o.paid_at), o.code, STATUS[o.status], o.customer_name, who(o.paid_by ?? o.created_by),
          o.payment_method ? METHOD_LABEL[o.payment_method] : '',
          o.items.map(i => `${i.qty}x ${i.name}${i.options.length ? ` (${i.options.join(', ')})` : ''}`).join(' | '),
          ...(o.status === 'void' ? [0, 0, o.promo_name, 0, 0] : [o.subtotal, o.discount, o.promo_name, o.tax, o.total]),
          o.items.reduce((s, i) => s + i.refunded_amount, 0), o.items.reduce((s, i) => s + i.cogs, 0),
        ]),
      };
    case 'daily':
      return { headers: ['Hari bisnis', 'Transaksi', 'Pendapatan bersih', 'Laba kotor'], rows: byDay(d).map(r => [r.date, r.transactions, r.net_revenue, r.gross_profit]) };
    case 'payments': {
      const p = byPayment(d);
      return {
        headers: ['Metode', 'Transaksi', 'Jumlah', 'Porsi (%)'],
        rows: [
          ...p.methods.map(m => [METHOD_LABEL[m.method], m.transactions, m.amount, pct(m.share)]),
          ['Refund tunai', null, -p.refunds.cash, null], ['Refund non-tunai', null, -p.refunds.cashless, null],
          ['Bersih', p.methods.reduce((s, m) => s + m.transactions, 0), p.methods.reduce((s, m) => s + m.amount, 0) - p.refunds.cash - p.refunds.cashless, null],
        ],
      };
    }
    case 'products':
    case 'categories': {
      const ranked = name === 'products' ? byProduct(d) : byCategory(d);
      const add = (k: 'qty' | 'revenue' | 'net_of_tax' | 'cogs' | 'gross_profit') => ranked.reduce((s, r) => s + r[k], 0);
      const total = { name: 'Total', qty: add('qty'), revenue: add('revenue'), net_of_tax: add('net_of_tax'), cogs: add('cogs'), gross_profit: add('gross_profit') };
      return {
        headers: [name === 'products' ? 'Produk' : 'Kategori', 'Terjual', 'Pendapatan', 'HPP', 'Laba kotor', 'Margin (%)'],
        rows: [...ranked, total].map(r => [r.name, r.qty, r.revenue, r.cogs, r.gross_profit, r.net_of_tax ? pct(r.gross_profit / r.net_of_tax) : null]),
      };
    }
    case 'cashiers':
      return { headers: ['Kasir', 'Transaksi', 'Penjualan', 'Rata-rata'], rows: byCashier(d).map(r => [r.name, r.transactions, r.gross_sales, r.avg_ticket]) };
    case 'promos':
      return { headers: ['Promo', 'Dipakai', 'Total diskon', 'Penjualan', 'Rata-rata bill'], rows: byPromo(d).map(r => [r.name, r.uses, r.discount, r.sales, r.avg_ticket]) };
    case 'tax':
      return { headers: ['Hari bisnis', 'Pajak penjualan', 'Pajak refund', 'Pajak bersih'], rows: taxReport(d).map(r => [r.date, r.tax_sales, r.tax_refunds, r.tax_net]) };
    case 'voids': {
      const v = voidsAndRefunds(d);
      return {
        headers: ['Jenis', 'Waktu', 'No. bill', 'Alasan', 'Oleh', 'Metode', 'Jumlah'],
        rows: [
          ...v.voids.map(o => ['Void', o.business_date, o.code, o.void_reason, o.voided_by, '', null]),
          ...v.refunds.map(r => ['Refund', timeWIB(r.created_at), r.order_code, r.reason, r.employee, r.method === 'cash' ? 'Tunai' : 'Non-tunai', r.amount]),
        ],
      };
    }
  }
}
