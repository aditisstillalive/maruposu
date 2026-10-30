import type { Snapshot } from '../types';

/**
 * A tablet keeps the snapshot it last fetched; after a deploy that snapshot can
 * predate fields added since. Screens read it through this until the next sync.
 */
export function withSnapshotDefaults(s: Snapshot): Snapshot {
  return {
    ...s,
    orders: s.orders ?? [],
    cash_moves: s.cash_moves ?? [],
    day_numbers: s.day_numbers ?? { business_date: '', max_number: 0 },
    ingredients: s.ingredients ?? [],
    low_stock: s.low_stock ?? { count: 0, names: [] },
  };
}
