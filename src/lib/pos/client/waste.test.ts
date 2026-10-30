import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { recordWaste } from './actions';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('recordWaste', () => {
  it('queues waste.record with the lines', async () => {
    await recordWaste([{ product_id: 'kopi', option_ids: ['ice'], qty: 1 }, { ingredient_id: 'susu', qty: 200 }], 'tumpah', ' gelas jatuh ', 'emp-1');
    const [entry] = await db.outbox.toArray();
    expect(entry.mutation).toMatchObject({
      type: 'waste.record', reason: 'tumpah', note: 'gelas jatuh', employee_id: 'emp-1',
      lines: [{ product_id: 'kopi', option_ids: ['ice'], qty: 1 }, { ingredient_id: 'susu', qty: 200 }],
    });
    expect(entry.mutation.type === 'waste.record' && entry.mutation.waste_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('needs at least one line', async () => {
    await expect(recordWaste([], 'tumpah', null, 'emp-1')).rejects.toThrow();
  });
});
