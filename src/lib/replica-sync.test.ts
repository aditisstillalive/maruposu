import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { forWrite, SYNCED_TABLES } from './replica-sync';

describe('forWrite', () => {
  it('keeps a NULL json column NULL on the replica', () => {
    expect(forWrite('auditLog', { id: 'a', detail: null }).detail).toBe(Prisma.DbNull);
  });

  it('keeps NULL shift summaries and counts NULL', () => {
    const row = forWrite('shift', { id: 's', summary: null, denominations: null });
    expect(row.summary).toBe(Prisma.DbNull);
    expect(row.denominations).toBe(Prisma.DbNull);
  });

  it('leaves json values and other tables untouched', () => {
    const detail = { from: 1, to: 2 };
    expect(forWrite('auditLog', { id: 'a', detail }).detail).toBe(detail);
    const row = { id: 'p', description: null };
    expect(forWrite('product', row)).toBe(row);
  });
});

describe('SYNCED_TABLES', () => {
  const pos = ['promo', 'shift', 'cashMovement', 'order', 'orderItem', 'orderItemOption', 'refund', 'refundItem'];

  it('covers every model except the primary-only ones, parents first', () => {
    const models = Object.values(Prisma.ModelName).map(m => m[0].toLowerCase() + m.slice(1)).filter(m => !['pinThrottle', 'syncState', 'posMutation'].includes(m));
    for (const m of models) expect(SYNCED_TABLES, m).toContain(m);
    expect(SYNCED_TABLES.indexOf('diningTable')).toBeLessThan(SYNCED_TABLES.indexOf('order'));
  });

  it('includes the POS transaction tables', () => {
    for (const t of pos) expect(SYNCED_TABLES).toContain(t);
  });

  it('keeps device bookkeeping on the primary only', () => {
    expect(SYNCED_TABLES).not.toContain('posMutation');
    expect(SYNCED_TABLES).not.toContain('pinThrottle');
  });

  it('includes the inventory tables', () => {
    for (const t of ['ingredient', 'recipeLine', 'stockMovement', 'purchase', 'purchaseItem', 'stockOpname', 'stockOpnameLine', 'waste', 'wasteLine']) {
      expect(SYNCED_TABLES).toContain(t);
    }
  });

  it('lists parents before children', () => {
    const before = (a: string, b: string) => SYNCED_TABLES.indexOf(a as never) < SYNCED_TABLES.indexOf(b as never);
    const pairs: [string, string][] = [
      ['employee', 'shift'], ['shift', 'cashMovement'], ['shift', 'order'], ['order', 'orderItem'],
      ['orderItem', 'orderItemOption'], ['order', 'refund'], ['refund', 'refundItem'], ['orderItem', 'refundItem'],
      ['refund', 'cashMovement'], ['outlet', 'promo'],
      ['ingredient', 'recipeLine'], ['product', 'recipeLine'], ['option', 'recipeLine'], ['ingredient', 'stockMovement'],
      ['purchase', 'purchaseItem'], ['stockOpname', 'stockOpnameLine'], ['waste', 'wasteLine'], ['ingredient', 'purchaseItem'],
    ];
    for (const [parent, child] of pairs) expect(before(parent, child), `${parent} before ${child}`).toBe(true);
  });
});

describe('forWrite: Json columns', () => {
  it('writes a missing receipt logo as SQL NULL', () => {
    expect(forWrite('setting', { id: 's', receipt_logo: null }).receipt_logo).toBe(Prisma.DbNull);
  });
});
