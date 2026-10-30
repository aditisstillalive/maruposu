import { describe, expect, it } from 'vitest';
import { filterOrders, ordersFilterFromParams } from './filters';
import { orders } from './fixtures.test-helpers';

const ids = (f: Parameters<typeof filterOrders>[1]) => filterOrders(orders, f).map(o => o.id);

describe('transaction filters', () => {
  it('keeps everything without filters', () => {
    expect(ids({})).toEqual(['o1', 'o2', 'o3', 'o4', 'o5']);
  });
  it('filters by method, status and cashier (who paid, else who opened)', () => {
    expect(ids({ method: 'cash' })).toEqual(['o1', 'o5']);
    expect(ids({ status: 'void' })).toEqual(['o4']);
    expect(ids({ cashier: 'e1' })).toEqual(['o1', 'o3', 'o4']);
    expect(ids({ cashier: 'e2', method: 'qris' })).toEqual(['o2']);
  });
  it('ignores unknown values from the URL', () => {
    expect(ordersFilterFromParams({ method: 'bitcoin', status: 'open', cashier: ['a', 'b'] })).toEqual({});
    expect(ordersFilterFromParams({ method: 'edc', status: 'refunded', cashier: 'e1' })).toEqual({ method: 'edc', status: 'refunded', cashier: 'e1' });
  });
});
