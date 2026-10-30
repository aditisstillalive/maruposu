import { describe, expect, it } from 'vitest';
import { withSnapshotDefaults } from './snapshot-defaults';
import type { Snapshot } from '../types';

describe('withSnapshotDefaults', () => {
  it('fills fields a tablet cached before an update (F2/F3 snapshots) so screens never crash', () => {
    const old = { device_tag: 'A7', employees: [], categories: [], products: [], promos: [] } as unknown as Snapshot;
    const s = withSnapshotDefaults(old);
    expect(s.ingredients).toEqual([]);
    expect(s.low_stock).toEqual({ count: 0, names: [] });
    expect(s.cash_moves).toEqual([]);
    expect(s.orders).toEqual([]);
    expect(s.day_numbers).toEqual({ business_date: '', max_number: 0 });
  });

  it('keeps values that are there', () => {
    const s = withSnapshotDefaults({ ingredients: [{ id: 'i', name: 'Susu', unit: 'ml' }], low_stock: { count: 1, names: ['Susu'] } } as unknown as Snapshot);
    expect(s.ingredients).toHaveLength(1);
    expect(s.low_stock.count).toBe(1);
  });
});
