// Column layouts for each report's export (CSV and Excel). Pages show the same
// numbers from the same aggregate functions.
import { byCashier, byCategory, byDay, byPayment, byProduct, byPromo, summary, taxReport, voidsAndRefunds } from './aggregate';
import { toCsv } from './csv';
import { longDateID } from './dates';
import type { ReportData } from './types';

export const REPORTS = ['summary', 'transactions', 'daily', 'payments', 'products', 'categories', 'cashiers', 'promos', 'tax', 'voids'] as const;
export type ReportName = (typeof REPORTS)[number];

/** Sheet names and titles, in the order of the all-reports workbook. */
export const REPORT_TITLE: Record<ReportName, [sheet: string, title: string]> = {
  summary: ['Ringkasan', 'Ringkasan penjualan'],
  daily: ['Per hari', 'Penjualan per hari'],
  transactions: ['Transaksi', 'Detail transaksi'],
  payments: ['Pembayaran', 'Metode pembayaran'],
  products: ['Produk', 'Penjualan per produk'],
  categories: ['Kategori', 'Penjualan per kategori'],
  promos: ['Promo', 'Promo & kupon'],
  tax: ['Pajak', 'Pajak per hari'],
  cashiers: ['Kasir', 'Penjualan per kasir'],
  voids: ['Void & refund', 'Bill dibatalkan & refund'],
};

export type Kind = 'text' | 'number' | 'rupiah' | 'pct';
/** pct cells hold fractions (0.157); a typed cell overrides its column's kind. */
export type Cell = string | number | null | { value: number; kind: Kind };
export type Table = { headers: string[]; kinds: Kind[]; rows: Cell[][]; totalRow?: boolean };

export const METHOD_LABEL: Record<string, string> = { cash: 'Tunai', edc: 'EDC', qris: 'QRIS' };
const STATUS: Record<string, string> = { paid: 'Lunas', refunded: 'Refund', void: 'Batal', open: 'Open' };
const timeWIB = (iso: string | null) => (iso ? new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 16) : '');

// Decimal comma: the `;`-separated file is meant for Indonesian Excel
const csvPct = (x: number) => String(Math.round(x * 1000) / 10).replace('.', ',');

export function tableCsv(t: Table): string {
  return toCsv(t.headers, t.rows.map(r => r.map((c, j) => {
    const kind = c !== null && typeof c === 'object' ? c.kind : t.kinds[j];
    const v = c !== null && typeof c === 'object' ? c.value : c;
    return kind === 'pct' && typeof v === 'number' ? csvPct(v) : v;
  })));
}

export function reportTable(name: ReportName, d: ReportData): Table {
  const who = (id: string | null) => (id ? d.employees[id] ?? id : '');
  const n = (value: number): Cell => ({ value, kind: 'number' });
  switch (name) {
    case 'summary': {
      const s = summary(d);
      return {
        headers: ['Keterangan', 'Nilai'], kinds: ['text', 'rupiah'],
        rows: [
          ['Transaksi', n(s.transactions)], ['Penjualan kotor', s.gross_sales], ['Refund', -s.refunds], ['Pendapatan bersih', s.net_revenue],
          ['Pajak', -s.tax], ['Pendapatan tanpa pajak', s.net_of_tax], ['HPP', -s.cogs], ['Laba kotor', s.gross_profit],
          ['Rata-rata per transaksi', s.avg_ticket], ['Total diskon', s.discounts], ['Bill memakai promo', n(s.promo_orders)], ['Bill dibatalkan', n(s.voids)],
        ],
      };
    }
    case 'transactions':
      return {
        kinds: ['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'rupiah', 'rupiah', 'text', 'rupiah', 'rupiah', 'rupiah', 'rupiah'],
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
      return {
        headers: ['Hari bisnis', 'Transaksi', 'Pendapatan bersih', 'Laba kotor'], kinds: ['text', 'number', 'rupiah', 'rupiah'],
        rows: byDay(d).map(r => [longDateID(r.date), r.transactions, r.net_revenue, r.gross_profit]),
      };
    case 'payments': {
      const p = byPayment(d);
      return {
        headers: ['Metode', 'Transaksi', 'Jumlah', 'Porsi (%)'], kinds: ['text', 'number', 'rupiah', 'pct'], totalRow: true,
        rows: [
          ...p.methods.map(m => [METHOD_LABEL[m.method], m.transactions, m.amount, m.share]),
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
        kinds: ['text', 'number', 'rupiah', 'rupiah', 'rupiah', 'pct'], totalRow: true,
        rows: [...ranked, total].map(r => [r.name, r.qty, r.revenue, r.cogs, r.gross_profit, r.net_of_tax ? r.gross_profit / r.net_of_tax : null]),
      };
    }
    case 'cashiers':
      return { headers: ['Kasir', 'Transaksi', 'Penjualan', 'Rata-rata'], kinds: ['text', 'number', 'rupiah', 'rupiah'], rows: byCashier(d).map(r => [r.name, r.transactions, r.gross_sales, r.avg_ticket]) };
    case 'promos':
      return { headers: ['Promo', 'Dipakai', 'Total diskon', 'Penjualan', 'Rata-rata bill'], kinds: ['text', 'number', 'rupiah', 'rupiah', 'rupiah'], rows: byPromo(d).map(r => [r.name, r.uses, r.discount, r.sales, r.avg_ticket]) };
    case 'tax':
      return { headers: ['Hari bisnis', 'Pajak penjualan', 'Pajak refund', 'Pajak bersih'], kinds: ['text', 'rupiah', 'rupiah', 'rupiah'], rows: taxReport(d).map(r => [r.date, r.tax_sales, r.tax_refunds, r.tax_net]) };
    case 'voids': {
      const v = voidsAndRefunds(d);
      return {
        headers: ['Jenis', 'Waktu', 'No. bill', 'Alasan', 'Oleh', 'Metode', 'Jumlah'], kinds: ['text', 'text', 'text', 'text', 'text', 'text', 'rupiah'],
        rows: [
          ...v.voids.map(o => ['Void', o.business_date, o.code, o.void_reason, o.voided_by, '', null]),
          ...v.refunds.map(r => ['Refund', timeWIB(r.created_at), r.order_code, r.reason, r.employee, r.method === 'cash' ? 'Tunai' : 'Non-tunai', r.amount]),
        ],
      };
    }
  }
}
