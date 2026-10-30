import type { ReportOrder } from './types';

export type OrdersFilter = { method?: 'cash' | 'edc' | 'qris'; status?: 'paid' | 'refunded' | 'void'; cashier?: string };

const METHODS = ['cash', 'edc', 'qris'];
const STATUSES = ['paid', 'refunded', 'void'];

/** Transaction-detail filters from the URL; unknown values are dropped. */
export function ordersFilterFromParams(sp: Record<string, string | string[] | undefined>): OrdersFilter {
  const one = (k: string) => (typeof sp[k] === 'string' && sp[k] ? (sp[k] as string) : undefined);
  const f: OrdersFilter = {};
  const method = one('method');
  const status = one('status');
  const cashier = one('cashier');
  if (method && METHODS.includes(method)) f.method = method as OrdersFilter['method'];
  if (status && STATUSES.includes(status)) f.status = status as OrdersFilter['status'];
  if (cashier) f.cashier = cashier;
  return f;
}

/** The cashier of a bill is who took the payment, or who opened it if it was never paid. */
export function filterOrders(orders: ReportOrder[], f: OrdersFilter): ReportOrder[] {
  return orders.filter(o =>
    (!f.method || o.payment_method === f.method)
    && (!f.status || o.status === f.status)
    && (!f.cashier || (o.paid_by ?? o.created_by) === f.cashier));
}
