// Every report number, computed from ReportData. Definitions are in
// docs/PLAN.md ("Keputusan F5"); screens and CSV exports both use these.
import { daysIn } from './period';
import type { ReportData, ReportItem, ReportOrder } from './types';

const sold = (o: ReportOrder) => o.status === 'paid' || o.status === 'refunded';
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
const avg = (total: number, n: number) => (n ? Math.round(total / n) : 0);

/** A line's revenue after refunds, without its share of the bill's tax. */
function lineNetOfTax(o: ReportOrder, i: ReportItem): number {
  const kept = i.paid - i.refunded_amount;
  return o.total > 0 ? Math.round((kept * (o.total - o.tax)) / o.total) : 0;
}

export type Summary = {
  transactions: number; gross_sales: number; refunds: number; net_revenue: number; tax: number; net_of_tax: number;
  cogs: number; gross_profit: number; avg_ticket: number; discounts: number; promo_orders: number; voids: number;
};

export function summary(d: ReportData): Summary {
  const s = d.orders.filter(sold);
  const gross_sales = sum(s, o => o.total);
  const refunds = sum(d.refunds, r => r.amount);
  const net_revenue = gross_sales - refunds;
  const tax = sum(s, o => o.tax) - sum(d.refunds, r => r.tax);
  const net_of_tax = net_revenue - tax;
  const cogs = sum(s, o => sum(o.items, i => i.cogs));
  return {
    transactions: s.length, gross_sales, refunds, net_revenue, tax, net_of_tax, cogs, gross_profit: net_of_tax - cogs,
    avg_ticket: avg(gross_sales, s.length), discounts: sum(s, o => o.discount), promo_orders: s.filter(o => o.promo_id).length,
    voids: d.orders.filter(o => o.status === 'void').length,
  };
}

/** Relative change (0.5 = +50%), or null when there is nothing to compare with. */
export function change(current: number, previous: number): number | null {
  return previous === 0 ? null : (current - previous) / previous;
}

export function byDay(d: ReportData) {
  return daysIn(d.period).map(date => {
    const s = summary({ ...d, orders: d.orders.filter(o => o.business_date === date), refunds: d.refunds.filter(r => r.business_date === date) });
    return { date, transactions: s.transactions, net_revenue: s.net_revenue, gross_profit: s.gross_profit };
  });
}

export function byPayment(d: ReportData) {
  const s = d.orders.filter(sold);
  const gross = sum(s, o => o.total);
  const methods = (['cash', 'edc', 'qris'] as const)
    .map(method => {
      const of = s.filter(o => o.payment_method === method);
      const amount = sum(of, o => o.total);
      return { method, transactions: of.length, amount, share: gross ? amount / gross : 0 };
    })
    .filter(m => m.transactions > 0)
    .sort((a, b) => b.amount - a.amount);
  return {
    methods,
    refunds: { cash: sum(d.refunds.filter(r => r.method === 'cash'), r => r.amount), cashless: sum(d.refunds.filter(r => r.method === 'cashless'), r => r.amount) },
  };
}

type Ranked = { key: string; name: string; qty: number; revenue: number; cogs: number; gross_profit: number };

function rank(d: ReportData, keyOf: (i: ReportItem) => string, nameOf: (i: ReportItem) => string): Ranked[] {
  const rows = new Map<string, Ranked & { seen: string }>();
  const ordered = d.orders.filter(sold).sort((a, b) => (a.paid_at ?? '').localeCompare(b.paid_at ?? ''));
  for (const o of ordered) {
    for (const i of o.items) {
      const key = keyOf(i);
      const r = rows.get(key) ?? { key, name: nameOf(i), qty: 0, revenue: 0, cogs: 0, gross_profit: 0, seen: '' };
      r.name = nameOf(i); // latest bill's name wins (products get renamed)
      r.qty += i.qty;
      r.revenue += i.paid - i.refunded_amount;
      r.cogs += i.cogs;
      r.gross_profit += lineNetOfTax(o, i) - i.cogs;
      rows.set(key, r);
    }
  }
  return [...rows.values()].map(({ seen: _seen, ...r }) => r).sort((a, b) => b.revenue - a.revenue || b.qty - a.qty);
}

export const byProduct = (d: ReportData) => rank(d, i => i.product_id || i.name, i => i.name);
export const byCategory = (d: ReportData) => rank(d, i => i.category_id || '-', i => i.category_name || 'Tanpa kategori');

export function byCashier(d: ReportData) {
  const s = d.orders.filter(sold);
  const keys = [...new Set(s.map(o => o.paid_by ?? '-'))];
  return keys
    .map(key => {
      const of = s.filter(o => (o.paid_by ?? '-') === key);
      const gross_sales = sum(of, o => o.total);
      return { key, name: d.employees[key] ?? key, transactions: of.length, gross_sales, avg_ticket: avg(gross_sales, of.length) };
    })
    .sort((a, b) => b.gross_sales - a.gross_sales);
}

export function byPromo(d: ReportData) {
  const s = d.orders.filter(sold);
  const ids = [...new Set(s.filter(o => o.promo_id).map(o => o.promo_id!))];
  const row = (key: string | null, name: string, of: ReportOrder[]) => {
    const sales = sum(of, o => o.total);
    return { key, name, uses: of.length, discount: sum(of, o => o.discount), sales, avg_ticket: avg(sales, of.length) };
  };
  const promos = ids.map(id => {
    const of = s.filter(o => o.promo_id === id);
    return row(id, of[of.length - 1].promo_name ?? id, of);
  }).sort((a, b) => b.uses - a.uses);
  return [...promos, row(null, 'Tanpa promo', s.filter(o => !o.promo_id))];
}

export function taxReport(d: ReportData) {
  return daysIn(d.period).map(date => {
    const tax_sales = sum(d.orders.filter(o => sold(o) && o.business_date === date), o => o.tax);
    const tax_refunds = sum(d.refunds.filter(r => r.business_date === date), r => r.tax);
    return { date, tax_sales, tax_refunds, tax_net: tax_sales - tax_refunds };
  });
}

export function voidsAndRefunds(d: ReportData) {
  const voids = d.orders.filter(o => o.status === 'void').map(o => ({ ...o, voided_by: o.voided_by ? d.employees[o.voided_by] ?? o.voided_by : null }));
  const refunds = d.refunds.map(r => ({ ...r, employee: d.employees[r.employee_id] ?? r.employee_id }));
  return { voids, refunds, totals: { voids: voids.length, refunds: refunds.length, refund_amount: sum(d.refunds, r => r.amount) } };
}

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * 7×24 grid (Monday first × WIB hour) by the wall-clock time of payment.
 * Filtered to a product, cells count that product's quantity.
 */
export function heatmap(d: ReportData, filter?: { product_id: string }) {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ transactions: 0, revenue: 0 })));
  for (const o of d.orders.filter(sold)) {
    if (!o.paid_at) continue;
    const wib = new Date(new Date(o.paid_at).getTime() + WIB_OFFSET_MS);
    const cell = grid[(wib.getUTCDay() + 6) % 7][wib.getUTCHours()];
    if (filter) {
      const lines = o.items.filter(i => i.product_id === filter.product_id);
      cell.transactions += sum(lines, i => i.qty);
      cell.revenue += sum(lines, i => i.paid);
    } else {
      cell.transactions += 1;
      cell.revenue += o.total;
    }
  }
  return grid;
}
