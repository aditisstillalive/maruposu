import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { forWrite } from './replica-sync';

describe('forWrite', () => {
  it('keeps a NULL json column NULL on the replica', () => {
    expect(forWrite('auditLog', { id: 'a', detail: null }).detail).toBe(Prisma.DbNull);
  });

  it('leaves json values and other tables untouched', () => {
    const detail = { from: 1, to: 2 };
    expect(forWrite('auditLog', { id: 'a', detail }).detail).toBe(detail);
    const row = { id: 'p', description: null };
    expect(forWrite('product', row)).toBe(row);
  });
});
