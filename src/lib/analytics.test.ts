import { describe, expect, it } from 'vitest';
import { maskUrl } from './analytics';

describe('maskUrl', () => {
  it('hides the table QR token and the order id from analytics', () => {
    expect(maskUrl('https://maruposu.vercel.app/t/V-Gw0PrQysqkdlH1o5rnQg')).toBe('https://maruposu.vercel.app/t/[meja]');
    expect(maskUrl('https://maruposu.vercel.app/t/V-Gw0PrQysqkdlH1o5rnQg/o/6f1c2a3b-0000-4000-8000-123456789abc?x=1'))
      .toBe('https://maruposu.vercel.app/t/[meja]/o/[pesanan]');
  });

  it('leaves other pages alone', () => {
    expect(maskUrl('https://maruposu.vercel.app/pos')).toBe('https://maruposu.vercel.app/pos');
    expect(maskUrl('https://maruposu.vercel.app/admin/reports/transactions?from=2026-11-01')).toBe('https://maruposu.vercel.app/admin/reports/transactions?from=2026-11-01');
  });
});
